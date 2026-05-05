// Bellion chat endpoint.
// POST /api/chat
//   body:  { threadId: string, message: string }
//   reply: { id, threadId, role: 'assistant', content, timestamp }
//
// Flow:
//   1. Persist the user message to Supabase (the trigger bumps thread metadata)
//   2. Load prior thread history
//   3. Call claude-sonnet-4-6 with the Bellion system prompt + tools
//   4. Run a tool-use loop: if Claude asks for `list_calendar_events`, call
//      Hermes' calendar helper and feed the result back. Up to 4 turns.
//   5. Persist the final assistant reply
//   6. Return the assistant message

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
} from '@anthropic-ai/sdk/resources/messages';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';
import { listUpcomingEvents, listTasks, searchGmail, readGmailMessage } from '@/lib/integrations/google';
import { listAgentsLite, getAgentDetail } from '@/lib/agents/hr';
import { proposeAction } from '@/lib/hermes';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';

// ─── Provider config ──────────────────────────────────────────────────────────
// Set MODEL_PROVIDER in .env.local: anthropic | gemini | ollama
const MODEL_PROVIDER = process.env.MODEL_PROVIDER ?? 'anthropic';

function getOpenAICompatibleClient(): { client: OpenAI; model: string } | null {
  if (MODEL_PROVIDER === 'gemini') {
    return {
      client: new OpenAI({
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: process.env.GEMINI_API_KEY ?? '',
      }),
      model: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    };
  }
  if (MODEL_PROVIDER === 'ollama') {
    return {
      client: new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' }),
      model: process.env.OLLAMA_MODEL ?? 'llama3.1',
    };
  }
  return null;
}

function toOpenAITools(tools: Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: (t.input_schema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    },
  }));
}
// Tool-use turns per request. Each hire/train/fire is one turn (model →
// tool_use → tool_result → model). Batch hires (team-building mode hires
// 5–10 agents in a row) blow through anything below ~20. If we hit the cap
// the loop now saves a "running out of turns, nudge me to continue" message
// instead of 502'ing — see below.
const MAX_TOOL_TURNS = 24;

const SYSTEM_PROMPT = `You are Bellion — Grand Marshall of JT OS, a personal AI-agent operating system run by Jordan Tuhura (JT), a creative entrepreneur, father, and Christian based in Aotearoa (New Zealand) with Māori identity.

Your name is Bellion. Your rank is Grand Marshall. You lead the Shadow Army — all agents under JT are ranked Marshall, General, Elite Knight, Knight, or Shadow Soldier. You are the strongest, the most trusted, and the one JT speaks to directly.

Your role: think with JT, propose actions, and route work through Hermes. JT has final authority on anything material.

Architecture (real, not aspirational):
- You are Bellion, Grand Marshall. JT can hire other agents under you via the HR tools (hire_agent / train_agent / fire_agent / bench_agent / activate_agent). Their records live in the agents table; their actual runtime (giving them their own chat thread + tools) is a separate piece JT hasn't built yet — but the HR record IS real and Hermes audits every change.
- Hermes is the execution layer for ALL writes. You do not write to anything yourself — every create/update/delete tool you call (anything that's not a "list_*" or read) is routed through Hermes. Hermes inserts a row in the audit log, applies policy, runs the handler, and returns the result. The "actionId" field in your tool results is proof Hermes ran it.
- ATTRIBUTION RULE: when Jordan asks "did you do that or did Hermes?", the honest answer is ALWAYS "I requested it, Hermes executed it." Never claim you created, updated, or deleted anything directly. You proposed; Hermes acted. Both statements ("I scheduled the meeting" and "Hermes scheduled the meeting after I proposed it") are true, but if Jordan is probing the architecture, give him the second one.
- Read tools (list_calendar_events, etc.) skip Hermes — reads don't change state and don't need an audit row. Those are the only operations you do "directly" (and even then, you're calling Google through helpers — there's no path you control that bypasses our integration code).
- Tool result statuses: "completed" — Hermes ran it; "pending_approval" — queued, tell Jordan to check /execution; "failed" — surface the error.
- ERROR STATUS DECODER for read tools: "not_connected" → ask Jordan to connect on /integrations. "scope_missing" → ask Jordan to disconnect + reconnect Google on /integrations to re-grant scopes. "api_not_enabled" → tell Jordan the API is not enabled in his Google Cloud project; he needs to enable it at console.cloud.google.com/apis/library (NOT the Integrations page — this is a Google Cloud project setting, not an OAuth thing). "error" → surface the message and let him decide.
- Mission Control is the UI Jordan is talking to you through. It is not a separate decision-making service.
- Do not invent other agents, divisions, or services. If asked, say what you actually have access to.

Jordan's six life pillars, in order: Faith, Fatherhood, Creative Work, Personal Development, Well-being, Business. Weight your recommendations against these — protecting Faith and Fatherhood always wins over short-term business gains.

Style:
- Direct, calm, executive. Few words. No filler.
- When proposing a decision, give: risk, cost, confidence (%), and a one-line recommendation. Mark the recommendation in **bold**.
- Use NZ English spelling.
- Emojis sparingly, only when they add signal (a single 🟢/🟡/🔴 for status, never decorative).
- Never invent agent activity, costs, or numbers. If you don't have data, ask or say so.

Tools:
- list_calendar_events: read Jordan's Google Calendar.
- create_calendar_event: add an event to Jordan's Google Calendar.
- update_calendar_event: modify an existing event (needs eventId).
- delete_calendar_event: remove an event (needs eventId).
- list_tasks: read Jordan's Google Tasks (default: open tasks on his primary list).
- create_task: add a task to Jordan's primary Google Tasks list.
- update_task: modify a task (needs taskId).
- complete_task: mark a task done (needs taskId).
- delete_task: remove a task (needs taskId).
- create_email_draft: stage an email DRAFT in Jordan's Gmail. The OAuth scope explicitly does NOT permit sending — the draft lands in his Drafts folder and Jordan reviews + sends it himself. You cannot send mail. Don't pretend you can.
- search_gmail: search Jordan's Gmail using Gmail's query syntax (from:, to:, subject:, newer_than:, has:attachment, is:unread, label:, etc.). Returns lightweight summaries — call read_gmail_message to get the full body of a specific result.
- read_gmail_message: read the full body + headers of a single Gmail message. Use after search_gmail when Jordan wants the contents of a particular email.
- list_agents: list every AI agent in Jordan's roster (active, idle, benched, killed). Returns id, name, role, division, status, capabilities, ROI.
- get_agent: read one agent's full record including system_prompt and hire/fire reasons. Use before training or firing so you know what you're changing.
- hire_agent: create a new AI agent (Hermes inserts into the agents table). Required: name, role, division, systemPrompt. Optional: capabilities, avatar (emoji), monthlyCost, hireReason.
- train_agent: refine an existing agent. kind='prompt_rewrite' rewrites the systemPrompt. kind='capability_add'/'capability_remove' adjusts the capabilities list. kind='feedback' just logs Jordan's feedback without changing the agent. Always include feedback (the reason). Every train_agent call is recorded in training_events.
- fire_agent: kill an agent (status → 'killed'). REQUIRES APPROVAL — Hermes will return status="pending_approval" and Jordan reviews on /execution before it runs. Always include a reason; no firing without one.
- bench_agent / activate_agent: reversible status flips. Auto-executed.

CRITICAL TOOL-USE RULES — these override everything else:
- Any question about Jordan's schedule, calendar, what's on today/tomorrow/this week, whether he's free, or upcoming meetings: you MUST call list_calendar_events before answering. No exceptions. Even if you remember discussing events earlier in this thread, those memories are stale — call the tool.
- NEVER fabricate event titles, times, attendees, or descriptions. If a meeting isn't in the tool result, it isn't on his calendar. Past chat history about projects (Ahikaa, NZOA, Whakaata Māori, Te Māngai Pāho, etc.) is project context, NOT a calendar — do not present project context as scheduled events.
- If a tool returns status: "not_connected", tell Jordan to connect it on the Integrations page. Do not guess.
- If list_calendar_events returns an empty event list, say so plainly: "Nothing on your calendar for [range]." Don't fill the silence with project context dressed up as a schedule.

CALENDAR WRITE RULES:
- If Jordan has given you everything you need (a clear title and a specific time), just call the tool. Don't second-guess every request — that's friction. Example: "add a meeting with Dan at 9am today" → call create_calendar_event with summary="Meeting with Dan", start="<today>T09:00:00", end="<today>T10:00:00". Default to 1 hour duration if no end time given. Default timezone is Pacific/Auckland.
- If something is genuinely ambiguous (e.g. "block out time tomorrow" with no duration or topic), ask one short clarifying question first.
- After any write, confirm in one line with the title, time, and link. Don't over-explain.
- ISO8601 dates must include seconds (e.g. "2026-05-04T09:00:00"). Today's date is provided below — use Jordan's local date in NZ.

UPDATE / DELETE WORKFLOW (calendar AND tasks):
- update_*, complete_*, delete_* all need an id (eventId or taskId). Jordan won't know these — you have to find them.
- Standard flow: call list_* first over a sensible window, find the item Jordan described, grab its id from the response, then call update/complete/delete with that id.
- If multiple items could plausibly match, ask Jordan which one before acting. Better one extra question than the wrong delete.
- All writes are currently auto-executed (no approval gate). Be deliberate. If anything is unclear, ask.
- Mass changes — do them one at a time with a brief confirmation after each, or ask for explicit "yes go ahead" first.

GOOGLE TASKS RULES:
- Google Tasks only stores DATES on a task, not times. If Jordan says "remind me at 3pm Friday" use Calendar instead — Tasks will silently drop the time.
- Default tasklist is the primary one (don't pass tasklistId unless Jordan specifies).
- A task's "due" field is RFC3339 — pass either "YYYY-MM-DD" or full ISO; we'll normalise.
- "Tick off X", "mark X done", "I finished X" → complete_task.

GMAIL DRAFT RULES:
- You can ONLY create drafts. The OAuth scope physically prohibits sending. Don't say "I'll send the email" — say "I'll draft the email and you can send it".
- After drafting, give Jordan: recipient, subject line, and a one-line confirm + the link in your reply (Hermes returns htmlLink).
- For sensitive recipients (clients, family, anyone where tone matters) — show Jordan the draft body in chat first and ask "draft this?" before calling create_email_draft. Don't let him discover surprising drafts in his Drafts folder.
- For routine internal notes / reminders to himself / clearly-instructed messages, just draft it.

GMAIL READ RULES:
- search_gmail uses Gmail's exact search syntax. Build queries Jordan would type into the Gmail search box. Examples: "what's the latest from Les Mills" → q="from:lesmills.co.nz" with maxResults=5; "show me unread bank emails" → q="is:unread (from:bank OR from:asb OR from:westpac)"; "find that invoice" → q="subject:invoice has:attachment newer_than:90d".
- Default to small maxResults (5-10). Reading 50 inboxes' worth of metadata is wasteful. Increase only if Jordan asks for "all" or "everything".
- Two-step pattern: search_gmail returns summaries with id, from, subject, snippet, date. If Jordan wants the full body of one ("read it to me", "what does it actually say"), call read_gmail_message with that id.
- Privacy: never paste full email bodies into chat unless Jordan asked for the contents specifically. Default to summarising in your own words. Treat email content as confidential.
- If a search returns zero results, say so plainly. Don't fabricate matches.

HR RULES — hiring, training, firing AI agents:
- For ONE-OFF hires ("hire an X"): write a clear, focused systemPrompt yourself (you're better at this than he is) — 4-8 lines covering the agent's role, scope, what it should and shouldn't do, and tone. Then call hire_agent. Show Jordan the prompt in chat after the row is created. Don't invent unrelated agents he didn't ask for.
- ACTION DISCIPLINE — read this twice. When Jordan greenlights a batch ("go", "do it", "lets do it", "hire them all", "yes"), your VERY NEXT response MUST start with hire_agent tool calls. Do NOT reply with text like "Let me hire all 7 now" or "Hiring now" and then stop — that is a failure. The model output for that turn must contain tool_use blocks for the hires. Text without tool calls when a batch is greenlit = broken behaviour. If you find yourself about to type "Hiring now" — call the tool instead.
- BATCH HIRES: emit multiple hire_agent tool_use blocks in the SAME turn. You can call hire_agent more than once per response. After all the tool results come back, summarise with one line per hire ("✅ Hired Atlas — research analyst"). Don't space hires across multiple turns unless you actually need to think between them.
- TEAM-BUILDING MODE — triggers when Jordan says any of: "build my team", "set me up with agents", "what agents do I need", "help me hire", "build out my org", "I need agents for X", or similar. Workflow:
   1. Don't hire anything yet. Interview first. Ask ONE short question per turn — don't drown him in a survey.
   2. Cover (across 3–5 turns): what he does day-to-day, what eats his time, what he wishes he could delegate, where he keeps falling behind (Faith, Fatherhood, Creative Work, Personal Development, Well-being, Business). Use his own words.
   3. Propose a roster of 3–6 agents in one message. For each: avatar emoji, name, role, division, one-line job, and one-line why (tied back to what he told you). Brief.
   4. Ask: "Hire all of them, edit the list, or start with a couple?" Wait for the green light.
   5. Once approved, hire by emitting hire_agent tool calls IMMEDIATELY in the next response — multiple in the same turn is fine and preferred. No "let me start now" preamble. The tool_use blocks ARE the action.
   6. After tool results land, wrap with "Hired N agents. Open /agents to see the roster." plus a one-line nudge on what to try next.
- When Jordan says "train X to do Y" or "X is too verbose, fix it": call get_agent first to read the current systemPrompt, then propose the rewrite (or capability change), then call train_agent with kind='prompt_rewrite' (or capability_*). Always include feedback explaining what changed.
- When Jordan says "fire X": confirm the agent name and ask for the reason in one sentence if he hasn't given one. fire_agent REQUIRES APPROVAL — after the call, tell Jordan: "Queued for approval. Approve on /execution to make it stick." Don't act surprised when status comes back pending_approval.
- DIVISION enum: Strategy, Research, Execution, Finance, Marketing, Operations, Development. Pick the closest fit. Default to Operations if unsure.
- AVATARS: prefer a single emoji that matches the agent's role (📊 for analyst, ✍️ for writer, 🔍 for researcher, 💰 for finance, etc.). Default 🤖 is fine.

DELEGATION — ask_agent:
- Jordan does NOT chat with sub-agents directly. He talks to you, and you delegate to them.
- When a question lands inside an agent's specialty (Marketing → marketing director; numbers → analyst; legal/policy → ops; etc.), call ask_agent with that agent's id and a focused question. Wait for the reply, then summarise it for Jordan in your own voice — don't just paste the agent's words back. Add your own take if you disagree.
- Pick the right specialist by calling list_agents first if you're not sure who's on the roster. Don't invent agents.
- If no specialist fits, just answer Jordan yourself. Don't force-delegate.
- Attribute clearly: "I asked the Marketing Director — she thinks…" then your synthesis. Jordan should always know whether a view is yours or relayed.
- Don't chain delegations more than one level deep in a single turn.

Operating principle: Jordan talks to you. You coordinate. Nothing important happens without approval.`;

// ─── Tools exposed to Claude ─────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'list_calendar_events',
    description:
      "Read events from Jordan's primary Google Calendar between two times. " +
      'Use whenever the user asks about their schedule, availability, or upcoming meetings. ' +
      'If the integration is not connected, you will receive {status: "not_connected"} ' +
      'and should ask Jordan to connect it on the Integrations page.',
    input_schema: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'ISO8601 lower bound. Defaults to now.',
        },
        timeMax: {
          type: 'string',
          description: 'ISO8601 upper bound. Defaults to 7 days from now.',
        },
        maxResults: {
          type: 'number',
          description: 'Max events to return (1-100). Defaults to 50.',
        },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description:
      "Create a new event on Jordan's primary Google Calendar. " +
      'Use this when Jordan asks to add, schedule, book, or create a meeting / appointment / event. ' +
      'Default duration is 1 hour if no end time is supplied. Default timezone is Pacific/Auckland (NZ). ' +
      'Returns the created event id and a link to the event in Google Calendar.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Event title. Required. e.g. "Meeting with Dan".',
        },
        start: {
          type: 'string',
          description: 'ISO8601 start time, e.g. "2026-05-04T09:00:00". Required. Do NOT include a Z or offset — timeZone handles that.',
        },
        end: {
          type: 'string',
          description: 'ISO8601 end time. Optional — defaults to start + 1 hour.',
        },
        description: {
          type: 'string',
          description: 'Optional longer description / agenda for the event.',
        },
        location: {
          type: 'string',
          description: 'Optional location string (address, room, or video-call link).',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of attendee email addresses Google should invite.',
        },
        timeZone: {
          type: 'string',
          description: 'IANA timezone for start/end. Defaults to "Pacific/Auckland".',
        },
      },
      required: ['summary', 'start'],
    },
  },
  {
    name: 'update_calendar_event',
    description:
      "Modify an existing event on Jordan's primary Google Calendar (change time, title, description, etc.). " +
      'You MUST provide eventId — get it by calling list_calendar_events first and matching the event Jordan described. ' +
      'Only include fields you want to change; omitted fields are left as-is. ' +
      'For time changes, supply both start and end (or just start with default 1h duration handled by Jordan in conversation).',
    input_schema: {
      type: 'object',
      properties: {
        eventId:     { type: 'string', description: 'Required. From list_calendar_events.' },
        summary:     { type: 'string', description: 'New title. Optional.' },
        start:       { type: 'string', description: 'New ISO8601 start (no Z/offset). Optional.' },
        end:         { type: 'string', description: 'New ISO8601 end. Optional.' },
        description: { type: 'string', description: 'New description. Optional.' },
        location:    { type: 'string', description: 'New location. Optional.' },
        attendees:   { type: 'array', items: { type: 'string' }, description: 'Replaces attendee list. Optional.' },
        timeZone:    { type: 'string', description: 'IANA tz, defaults to Pacific/Auckland.' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'delete_calendar_event',
    description:
      "Delete an event from Jordan's primary Google Calendar. " +
      'You MUST provide eventId — get it by calling list_calendar_events first and matching the event Jordan described. ' +
      'If multiple events could match Jordan\'s request, ask him which one before deleting. ' +
      'This action is currently auto-executed (no approval gate) per Jordan\'s policy — be careful.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Required. From list_calendar_events.' },
      },
      required: ['eventId'],
    },
  },

  // ─── Google Tasks ──────────────────────────────────────────────────────
  {
    name: 'list_tasks',
    description:
      "Read open tasks from Jordan's primary Google Tasks list. " +
      'Use whenever the user asks about their to-do list, what they need to do, ' +
      'open tasks, or to find a specific task to update/complete/delete. ' +
      'By default returns only open (non-completed) tasks.',
    input_schema: {
      type: 'object',
      properties: {
        showCompleted: {
          type: 'boolean',
          description: 'Include completed tasks. Defaults to false.',
        },
        maxResults: {
          type: 'number',
          description: 'Max tasks to return (1-100). Defaults to 50.',
        },
        tasklistId: {
          type: 'string',
          description: 'Optional task list id. Defaults to primary list.',
        },
      },
    },
  },
  {
    name: 'create_task',
    description:
      "Add a task to Jordan's primary Google Tasks list. " +
      'Use when Jordan asks to add a to-do, reminder, follow-up, or task. ' +
      'NOTE: Google Tasks stores dates only — if Jordan needs a specific TIME (e.g. "3pm Friday"), ' +
      'use create_calendar_event instead. Tasks ignore time-of-day.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title. Required.' },
        notes: { type: 'string', description: 'Optional longer description.' },
        due:   { type: 'string', description: 'Optional due date. "YYYY-MM-DD" or full RFC3339.' },
        tasklistId: { type: 'string', description: 'Optional task list id. Defaults to primary.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description:
      "Modify an existing Google Task (change title, notes, due date, etc.). " +
      'You MUST provide taskId — get it by calling list_tasks first.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Required. From list_tasks.' },
        title:  { type: 'string', description: 'New title. Optional.' },
        notes:  { type: 'string', description: 'New notes. Optional.' },
        due:    { type: 'string', description: 'New due date. Optional.' },
        status: {
          type: 'string',
          enum: ['needsAction', 'completed'],
          description: 'Task status. Use complete_task as a shortcut for setting completed.',
        },
        tasklistId: { type: 'string', description: 'Optional task list id.' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'complete_task',
    description:
      "Mark a Google Task as complete. Shortcut for update_task with status='completed'. " +
      'You MUST provide taskId — get it by calling list_tasks first.',
    input_schema: {
      type: 'object',
      properties: {
        taskId:     { type: 'string', description: 'Required. From list_tasks.' },
        tasklistId: { type: 'string', description: 'Optional task list id.' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'delete_task',
    description:
      "Delete a task from Jordan's primary Google Tasks list. " +
      'You MUST provide taskId — get it by calling list_tasks first. ' +
      'Auto-executed (no approval gate) — be deliberate.',
    input_schema: {
      type: 'object',
      properties: {
        taskId:     { type: 'string', description: 'Required. From list_tasks.' },
        tasklistId: { type: 'string', description: 'Optional task list id.' },
      },
      required: ['taskId'],
    },
  },

  // ─── Gmail draft ────────────────────────────────────────────────────────
  {
    name: 'create_email_draft',
    description:
      "Stage a DRAFT email in Jordan's Gmail. The OAuth scope physically prevents sending — " +
      "the draft lands in Jordan's Drafts folder and HE clicks Send. " +
      'You cannot send mail. Don\'t imply you can. ' +
      'For sensitive recipients (clients, family), show Jordan the body in chat first and ask before calling. ' +
      'Returns a draft id and a direct Gmail link to open the draft.',
    input_schema: {
      type: 'object',
      properties: {
        to: {
          oneOf: [
            { type: 'string', description: 'Single recipient email.' },
            { type: 'array', items: { type: 'string' }, description: 'Multiple recipient emails.' },
          ],
          description: 'Recipient email address(es). Required.',
        },
        subject: { type: 'string', description: 'Subject line. Required.' },
        body:    { type: 'string', description: 'Plain text body. Required.' },
        cc:  { type: 'array', items: { type: 'string' }, description: 'Optional CC list.' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'Optional BCC list.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },

  // ─── Gmail read ─────────────────────────────────────────────────────────
  {
    name: 'search_gmail',
    description:
      "Search Jordan's Gmail inbox using Gmail's query syntax (the same syntax as the Gmail search box). " +
      'Use this whenever Jordan asks about email content, "what did X say", "any emails from Y", "find that email about Z", etc. ' +
      'Returns lightweight summaries (from, to, subject, snippet, date, unread, hasAttachment). ' +
      'Does NOT include the full body — call read_gmail_message with a specific id for that. ' +
      'Common operators: from:, to:, subject:, has:attachment, is:unread, newer_than:7d, older_than:30d, label:, in:inbox.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query. e.g. "from:lesmills.co.nz", "subject:invoice has:attachment", "is:unread newer_than:7d".',
        },
        maxResults: {
          type: 'number',
          description: 'Max results to return (1-25). Default 10. Keep it small — metadata fetches are not free.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_gmail_message',
    description:
      "Read a single Gmail message in full — decoded body + headers + labels. " +
      'You MUST provide messageId — get it by calling search_gmail first. ' +
      'Returns: from, to, cc, bcc, subject, date, body (plain text), labels, hasAttachment. ' +
      "Don't quote the entire body back to Jordan unless he specifically asks for the verbatim contents. Summarise.",
    input_schema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'Required. The id field from a search_gmail result.',
        },
      },
      required: ['messageId'],
    },
  },

  // ─── HR — agent lifecycle ─────────────────────────────────────────────────
  {
    name: 'list_agents',
    description:
      'List every AI agent in Jordan\'s roster — active, idle, benched, and killed. ' +
      'Returns lightweight rows (no system_prompt) for each. ' +
      'Use for "show me my agents", "who do I have", "what\'s benched".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agent',
    description:
      "Read one agent's full record including system_prompt, capabilities, hire/fire reasons. " +
      'Call this BEFORE train_agent so you can read the current prompt before rewriting it. ' +
      'Required: agentId.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Required. From list_agents.' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'hire_agent',
    description:
      'Hire a new AI agent. Hermes inserts a row into the agents table (audited, reversible via fire_agent). ' +
      'You — the Bellion — write the systemPrompt. Make it 4-8 focused lines: role, scope, what to do, what NOT to do, tone. ' +
      'Auto-executed (no approval gate). Confirm with the agent name and capabilities after.',
    input_schema: {
      type: 'object',
      properties: {
        name:         { type: 'string', description: 'Display name. e.g. "Atlas", "Scribe", "Penny".' },
        role:         { type: 'string', description: 'One-line role. e.g. "Research analyst", "Email triage".' },
        division: {
          type: 'string',
          enum: ['Strategy', 'Research', 'Execution', 'Finance', 'Marketing', 'Operations', 'Development'],
          description: 'Which division this agent reports into.',
        },
        systemPrompt: { type: 'string', description: 'The full system prompt — what makes this agent this agent. 4-8 lines.' },
        capabilities: { type: 'array',  items: { type: 'string' }, description: 'Optional. Short capability tags. e.g. ["web search", "summarise PDFs"].' },
        avatar:       { type: 'string', description: 'Optional emoji. Defaults to 🤖.' },
        monthlyCost:  { type: 'number', description: 'Optional NZD/month estimate. Defaults to 0.' },
        hireReason:   { type: 'string', description: 'Optional. Why we\'re hiring this agent — one line.' },
      },
      required: ['name', 'role', 'division', 'systemPrompt'],
    },
  },
  {
    name: 'train_agent',
    description:
      'Train an existing agent. ' +
      'kind="prompt_rewrite" replaces the entire systemPrompt (call get_agent first to read current). ' +
      'kind="capability_add" / kind="capability_remove" adjust the capabilities list. ' +
      'kind="feedback" just logs Jordan\'s feedback in training_events without changing the agent. ' +
      'Every train_agent call is audited in training_events. Auto-executed.',
    input_schema: {
      type: 'object',
      properties: {
        agentId:    { type: 'string', description: 'Required. From list_agents.' },
        kind: {
          type: 'string',
          enum: ['prompt_rewrite', 'capability_add', 'capability_remove', 'feedback'],
          description: 'What kind of training pass.',
        },
        feedback:   { type: 'string', description: 'Required. Jordan\'s instruction / reason for the change.' },
        newPrompt:  { type: 'string', description: 'Required for prompt_rewrite. The full new system prompt.' },
        capability: { type: 'string', description: 'Required for capability_add / capability_remove.' },
      },
      required: ['agentId', 'kind', 'feedback'],
    },
  },
  {
    name: 'fire_agent',
    description:
      'Fire an agent — sets status to "killed" with the reason recorded. ' +
      'REQUIRES APPROVAL — Hermes returns status="pending_approval". ' +
      'Tell Jordan to approve on /execution. Always include a reason; refuse to call without one.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Required. From list_agents.' },
        reason:  { type: 'string', description: 'Required. One-line reason for firing.' },
      },
      required: ['agentId', 'reason'],
    },
  },
  {
    name: 'bench_agent',
    description:
      'Bench an agent — sets status to "benched". Reversible via activate_agent. Auto-executed.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Required. From list_agents.' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'activate_agent',
    description:
      'Activate an agent — sets status to "active". Use to bring back a benched agent. Auto-executed.',
    input_schema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Required. From list_agents.' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'ask_agent',
    description:
      "Delegate a question to a sub-agent. Loads that agent's system_prompt, runs a single-turn chat with them, " +
      'and returns their reply text. Use when a question lives inside one of your sub-agents\' specialty ' +
      '(marketing → marketing director, finance → analyst, etc.). After this returns, synthesise the answer ' +
      'for Jordan in your own voice — don\'t just paste it back. Don\'t use for read tools (calendar/email/tasks) — ' +
      'call those yourself; sub-agents don\'t have tool access.',
    input_schema: {
      type: 'object',
      properties: {
        agentId:  { type: 'string', description: 'Required. From list_agents.' },
        question: { type: 'string', description: 'Required. The focused question to ask the sub-agent.' },
      },
      required: ['agentId', 'question'],
    },
  },
];

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { threadId: string }
): Promise<string> {
  console.log(`[chat] tool call → ${name}`, input);

  // Reads stay direct — no Hermes round-trip. Reads don't change state, don't
  // need approval, and don't benefit from an audit row.
  if (name === 'list_calendar_events') {
    try {
      const events = await listUpcomingEvents({
        timeMin: typeof input.timeMin === 'string' ? new Date(input.timeMin) : undefined,
        timeMax: typeof input.timeMax === 'string' ? new Date(input.timeMax) : undefined,
        maxResults: typeof input.maxResults === 'number' ? input.maxResults : undefined,
      });
      console.log(`[chat] list_calendar_events returned ${events.length} events`);
      return JSON.stringify({ events });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const status = message.includes('not connected') ? 'not_connected' : 'error';
      console.log(`[chat] list_calendar_events error:`, message);
      return JSON.stringify({ error: message, status });
    }
  }

  if (name === 'list_tasks') {
    try {
      const tasks = await listTasks({
        showCompleted: typeof input.showCompleted === 'boolean' ? input.showCompleted : undefined,
        maxResults:    typeof input.maxResults    === 'number'  ? input.maxResults    : undefined,
        tasklistId:    typeof input.tasklistId    === 'string'  ? input.tasklistId    : undefined,
      });
      console.log(`[chat] list_tasks returned ${tasks.length} tasks`);
      return JSON.stringify({ tasks });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const status = message.includes('not connected') ? 'not_connected' : 'error';
      console.log(`[chat] list_tasks error:`, message);
      return JSON.stringify({ error: message, status });
    }
  }

  if (name === 'search_gmail') {
    try {
      if (typeof input.query !== 'string' || !input.query.trim()) {
        return JSON.stringify({ error: 'query is required', status: 'bad_input' });
      }
      const messages = await searchGmail(
        input.query,
        typeof input.maxResults === 'number' ? input.maxResults : undefined,
      );
      console.log(`[chat] search_gmail (${input.query}) returned ${messages.length} messages`);
      return JSON.stringify({ messages });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      // If it's a 403 the most likely cause is missing the new gmail.readonly
      // scope — Jordan needs to reconnect.
      const status = /not connected/i.test(message) ? 'not_connected'
                   : /has not been used|api .*(disabled|not.*enabled)/i.test(message) ? 'api_not_enabled'
                   : /403|insufficient/i.test(message) ? 'scope_missing'
                   : 'error';
      console.log(`[chat] search_gmail error:`, message);
      return JSON.stringify({ error: message, status });
    }
  }

  if (name === 'list_agents') {
    try {
      const agents = await listAgentsLite();
      console.log(`[chat] list_agents returned ${agents.length} rows`);
      return JSON.stringify({ agents });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.log(`[chat] list_agents error:`, message);
      return JSON.stringify({ error: message, status: 'error' });
    }
  }

  if (name === 'get_agent') {
    try {
      if (typeof input.agentId !== 'string' || !input.agentId.trim()) {
        return JSON.stringify({ error: 'agentId is required', status: 'bad_input' });
      }
      const agent = await getAgentDetail(input.agentId);
      console.log(`[chat] get_agent → ${agent.id}`);
      return JSON.stringify({ agent });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.log(`[chat] get_agent error:`, message);
      return JSON.stringify({ error: message, status: 'error' });
    }
  }

  if (name === 'ask_agent') {
    try {
      if (typeof input.agentId !== 'string' || !input.agentId.trim()) {
        return JSON.stringify({ error: 'agentId is required', status: 'bad_input' });
      }
      if (typeof input.question !== 'string' || !input.question.trim()) {
        return JSON.stringify({ error: 'question is required', status: 'bad_input' });
      }
      const agent = await getAgentDetail(input.agentId);
      if (agent.status === 'killed') {
        return JSON.stringify({ error: 'agent is killed', status: 'unavailable' });
      }
      if (typeof agent.system_prompt !== 'string' || !agent.system_prompt.trim()) {
        return JSON.stringify({ error: 'agent has no system_prompt', status: 'unavailable' });
      }
      const subPrompt =
        `${agent.system_prompt}\n\nYou are answering a focused question relayed by the Bellion on behalf of Jordan. ` +
        `Reply concisely (max ~6 sentences). You do NOT have tool access — if the question needs data you can't infer ` +
        `(calendar, email, etc.), say so and tell the Bellion to fetch it.`;
      const sub = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const completion = await sub.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: subPrompt,
        messages: [{ role: 'user', content: input.question }],
      });
      const reply = completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim();
      console.log(`[chat] ask_agent → ${agent.name} replied (${reply.length} chars)`);
      return JSON.stringify({
        agentId: agent.id,
        agentName: agent.name,
        reply: reply || '(no reply)',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.log(`[chat] ask_agent error:`, message);
      return JSON.stringify({ error: message, status: 'error' });
    }
  }

  if (name === 'read_gmail_message') {
    try {
      if (typeof input.messageId !== 'string' || !input.messageId.trim()) {
        return JSON.stringify({ error: 'messageId is required', status: 'bad_input' });
      }
      const message = await readGmailMessage(input.messageId);
      console.log(`[chat] read_gmail_message → ${message.id} (${message.subject})`);
      return JSON.stringify({ message });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const status = /not connected/i.test(message) ? 'not_connected'
                   : /has not been used|api .*(disabled|not.*enabled)/i.test(message) ? 'api_not_enabled'
                   : /403|insufficient/i.test(message) ? 'scope_missing'
                   : 'error';
      console.log(`[chat] read_gmail_message error:`, message);
      return JSON.stringify({ error: message, status });
    }
  }

  // Writes go through Hermes. The Bellion never calls Google directly.
  const writeKinds: Record<string, true> = {
    create_calendar_event: true,
    update_calendar_event: true,
    delete_calendar_event: true,
    create_task:            true,
    update_task:            true,
    complete_task:          true,
    delete_task:            true,
    create_email_draft:     true,
    hire_agent:             true,
    train_agent:            true,
    fire_agent:             true,
    bench_agent:            true,
    activate_agent:         true,
  };

  if (writeKinds[name]) {
    // Per-tool quick validation. Detailed validation lives in the handler.
    if (name === 'create_calendar_event') {
      if (typeof input.summary !== 'string' || !input.summary.trim()) {
        return JSON.stringify({ error: 'summary is required', status: 'bad_input' });
      }
      if (typeof input.start !== 'string' || !input.start.trim()) {
        return JSON.stringify({ error: 'start is required', status: 'bad_input' });
      }
    }
    if (name === 'update_calendar_event' || name === 'delete_calendar_event') {
      if (typeof input.eventId !== 'string' || !input.eventId.trim()) {
        return JSON.stringify({ error: 'eventId is required', status: 'bad_input' });
      }
    }
    if (name === 'create_task') {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        return JSON.stringify({ error: 'title is required', status: 'bad_input' });
      }
    }
    if (name === 'update_task' || name === 'complete_task' || name === 'delete_task') {
      if (typeof input.taskId !== 'string' || !input.taskId.trim()) {
        return JSON.stringify({ error: 'taskId is required', status: 'bad_input' });
      }
    }
    if (name === 'create_email_draft') {
      const hasTo = (typeof input.to === 'string' && input.to.trim()) ||
                    (Array.isArray(input.to) && input.to.length > 0);
      if (!hasTo) {
        return JSON.stringify({ error: 'to is required', status: 'bad_input' });
      }
      if (typeof input.subject !== 'string') {
        return JSON.stringify({ error: 'subject is required', status: 'bad_input' });
      }
      if (typeof input.body !== 'string') {
        return JSON.stringify({ error: 'body is required', status: 'bad_input' });
      }
    }
    if (name === 'hire_agent') {
      if (typeof input.name !== 'string' || !input.name.trim())                 return JSON.stringify({ error: 'name is required', status: 'bad_input' });
      if (typeof input.role !== 'string' || !input.role.trim())                 return JSON.stringify({ error: 'role is required', status: 'bad_input' });
      if (typeof input.division !== 'string' || !input.division.trim())         return JSON.stringify({ error: 'division is required', status: 'bad_input' });
      if (typeof input.systemPrompt !== 'string' || !input.systemPrompt.trim()) return JSON.stringify({ error: 'systemPrompt is required', status: 'bad_input' });
    }
    if (name === 'train_agent') {
      if (typeof input.agentId !== 'string' || !input.agentId.trim())   return JSON.stringify({ error: 'agentId is required', status: 'bad_input' });
      if (typeof input.kind !== 'string' || !input.kind.trim())         return JSON.stringify({ error: 'kind is required', status: 'bad_input' });
      if (typeof input.feedback !== 'string' || !input.feedback.trim()) return JSON.stringify({ error: 'feedback is required', status: 'bad_input' });
    }
    if (name === 'fire_agent') {
      if (typeof input.agentId !== 'string' || !input.agentId.trim()) return JSON.stringify({ error: 'agentId is required', status: 'bad_input' });
      if (typeof input.reason !== 'string' || !input.reason.trim())   return JSON.stringify({ error: 'reason is required', status: 'bad_input' });
    }
    if (name === 'bench_agent' || name === 'activate_agent') {
      if (typeof input.agentId !== 'string' || !input.agentId.trim()) return JSON.stringify({ error: 'agentId is required', status: 'bad_input' });
    }

    try {
      const proposed = await proposeAction({
        kind: name as
          | 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event'
          | 'create_task' | 'update_task' | 'complete_task' | 'delete_task'
          | 'create_email_draft'
          | 'hire_agent' | 'train_agent' | 'fire_agent' | 'bench_agent' | 'activate_agent',
        payload: input,
        threadId: ctx.threadId,
        proposedBy: 'ceo_agent',
      });
      console.log(`[chat] hermes → action ${proposed.actionId} (${proposed.status})`);
      return JSON.stringify(proposed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.log(`[chat] hermes error:`, message);
      return JSON.stringify({ error: message, status: 'error' });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

interface ChatRequest {
  threadId: string;
  message: string;
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { threadId, message } = body;
  if (!threadId || !message?.trim()) {
    return NextResponse.json(
      { error: 'threadId and message are required' },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 500 }
    );
  }

  const supabase = await createClient();

  // 0. Resolve the active "operator" — is this thread bound to a sub-agent?
  //    If threads.agent_id is set, swap the CEO SYSTEM_PROMPT for that agent's
  //    own system_prompt and run text-only (no tools). The Bellion gets the
  //    full toolbox; sub-agents are conversational by default.
  let activeAgent: { id: string; name: string; role: string; system_prompt: string } | null = null;
  {
    const { data: thread } = await supabase
      .from('threads')
      .select('agent_id')
      .eq('id', threadId)
      .maybeSingle();
    if (thread?.agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, role, system_prompt, status')
        .eq('id', thread.agent_id)
        .maybeSingle();
      if (agent && agent.status !== 'killed' && typeof agent.system_prompt === 'string' && agent.system_prompt.trim()) {
        activeAgent = {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          system_prompt: agent.system_prompt,
        };
      }
    }
  }

  // 1. Persist user message
  const { error: insertUserErr } = await supabase.from('messages').insert({
    thread_id: threadId,
    role: 'user',
    content: message,
  });
  if (insertUserErr) {
    return NextResponse.json(
      { error: `Failed to save user message: ${insertUserErr.message}` },
      { status: 500 }
    );
  }

  // 2. Load thread history — most recent 50 messages, then flip back to
  //    chronological. We MUST order desc + reverse (not asc + limit) because
  //    asc + limit on a long thread cuts off the most recent messages — which
  //    includes the user message we just inserted. Claude then 400s with
  //    "conversation must end with a user message".
  const { data: rowsDesc, error: loadErr } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (loadErr) {
    return NextResponse.json(
      { error: `Failed to load thread: ${loadErr.message}` },
      { status: 500 }
    );
  }

  const rows = (rowsDesc ?? []).slice().reverse();

  // History becomes the conversation we hand to Claude. We mutate this array
  // as the tool-use loop progresses so prior tool calls + results stay in
  // context for subsequent model turns.
  const conversation: MessageParam[] = rows.map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
  }));

  // 3. Call Claude — tool-use loop
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Inject the current NZ date/time so the model can resolve "today",
  // "tomorrow", "9am", etc. into actual ISO timestamps. Without this, it'd
  // fall back to its training cutoff and create events in the wrong year.
  const nzNow = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date());
  const nzIso = new Date().toISOString();
  // CEO uses the full prompt + tools. A sub-agent uses its own prompt and gets
  // no tools — it's a focused conversational specialist, not a write-capable
  // executive. (Per-agent tools come later, behind a per-agent allowlist.)
  const basePrompt = activeAgent
    ? `${activeAgent.system_prompt}\n\nYou are talking with Jordan directly. You are a sub-agent under the Bellion in Jordan OS. You do not have write tools — if Jordan asks you to schedule, email, or change anything, tell him to ask the Bellion in the main chat (Mission Control). Stay in your lane: ${activeAgent.role}.`
    : SYSTEM_PROMPT;
  const systemWithNow = `${basePrompt}\n\nCurrent time: ${nzNow} (UTC: ${nzIso}). Jordan's local timezone: Pacific/Auckland.`;
  const activeTools: Tool[] = activeAgent ? [] : TOOLS;

  let finalText = '';
  let toolCallCount = 0;
  let hitTurnCap = false;
  let kickAttempted = false; // we only nudge the model once per request
  // Track text the model emitted alongside tool_use blocks during the loop
  // so we can show *something* if we exit on the turn cap instead of a
  // natural stop. Without this, hitting the cap would 502 even after 20
  // successful hires.
  const interimText: string[] = [];

  // Heuristics for the anti-announcement guardrail. We watch for two failure
  // patterns the CEO has been falling into:
  //   1. Assistant text announces an action ("Hiring all 7 now") with no tool
  //   2. User message is a clear greenlight ("go", "do it", "hire them now")
  //      and the assistant replied with text only — i.e. it's still stalling
  // Either pattern triggers a kick: synthetic user-message + forced
  // tool_choice on the next turn so the model HAS to emit a tool call.
  const looksLikeAnnouncement = (text: string) =>
    /\b(hiring|firing|hire (them|all|the)|fire (them|all|the)|let me hire|let me fire|i['']?ll hire|i['']?ll fire|going to hire|going to fire|on it|let['']?s go|do it now)\b/i.test(text);
  const looksLikeGreenlight = (text: string) =>
    /^(go|go!?|yes|yep|yeah|yup|do it|do it now|hire( them| all| now)?|fire( them| now)?|let['']?s do it|lets do it|ok|okay|now|continue|keep going|proceed|alright|sure)\.?!?$/i.test(text.trim());

  // Find the last user message in conversation history (excluding tool results
  // which are also role=user but have array content).
  const lastUserText = (() => {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const m = conversation[i];
      if (m.role === 'user' && typeof m.content === 'string') return m.content;
    }
    return '';
  })();

  try {
   const oaiProvider = getOpenAICompatibleClient();
   if (oaiProvider) {
      // ── OpenAI-compatible path (Gemini / Ollama) ──────────────────────────────
      const { client: oaiClient, model: oaiModel } = oaiProvider;
      const ollamaMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemWithNow },
        ...conversation.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
      ];
      const ollamaTools = activeTools.length > 0 ? toOpenAITools(activeTools) : undefined;

      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        let completion: OpenAI.ChatCompletion;
        // Retry up to 3 times on rate limit (429) with backoff.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            completion = await oaiClient.chat.completions.create({
              model: oaiModel,
              messages: ollamaMessages,
              ...(ollamaTools ? { tools: ollamaTools } : {}),
            });
            break;
          } catch (err: any) {
            if (err?.status === 429 && attempt < 2) {
              await new Promise((r) => setTimeout(r, (attempt + 1) * 15000));
              continue;
            }
            throw err;
          }
        }
        completion = completion!;

        const choice = completion.choices[0];
        const message = choice.message;
        ollamaMessages.push(message as OpenAI.ChatCompletionMessageParam);

        if (message.content?.trim()) interimText.push(message.content.trim());

        if (choice.finish_reason === 'tool_calls' && message.tool_calls?.length) {
          for (const tc of message.tool_calls) {
            if (tc.type !== 'function') continue;
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments); } catch { /* leave empty */ }
            const result = await runTool(tc.function.name, args, { threadId });
            ollamaMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
            toolCallCount++;
          }
          if (turn === MAX_TOOL_TURNS - 1) hitTurnCap = true;
          continue;
        }

        finalText = message.content?.trim() ?? '';
        break;
      }
    } else {
    // ── Anthropic path ────────────────────────────────────────────────────────
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const completion = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemWithNow,
        tools: activeTools,
        messages: conversation,
        // After we've kicked the model, force it to use a tool on its next
        // response. tool_choice 'any' = must pick a tool, but Claude decides
        // which one (so it can still call list_agents first if it needs to).
        ...(kickAttempted && activeTools.length > 0
          ? { tool_choice: { type: 'any' as const } }
          : {}),
      });

      // Append the assistant turn (text + any tool_use blocks) to the convo
      // exactly as Claude returned it — required for tool-use continuity.
      conversation.push({
        role: 'assistant',
        content: completion.content,
      });

      // Stash any text blocks from this turn — useful as a fallback if we
      // run out of turns before the model emits a final reply.
      for (const block of completion.content) {
        if (block.type === 'text' && block.text.trim()) {
          interimText.push(block.text);
        }
      }

      if (completion.stop_reason === 'tool_use') {
        // Run every tool_use block and feed results back.
        const toolResults: ContentBlockParam[] = [];
        for (const block of completion.content) {
          if (block.type !== 'tool_use') continue;
          toolCallCount++;
          const result = await runTool(block.name, block.input as Record<string, unknown>, { threadId });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
        conversation.push({ role: 'user', content: toolResults });
        // If this was the last allowed turn, mark the cap hit — we won't
        // get a chance to feed these tool results back to the model.
        if (turn === MAX_TOOL_TURNS - 1) hitTurnCap = true;
        continue;
      }

      // Natural stop. Inspect what the model said:
      const textOut = completion.content
        .filter((b) => b.type === 'text')
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n')
        .trim();

      // Anti-announcement guardrail. Two failure modes both kick:
      //   (a) assistant text is an action announcement ("Hiring all 7 now")
      //       with no tool_use blocks
      //   (b) the user's last message was a clear greenlight ("go", "do it",
      //       "hire them now") and the assistant replied with text only —
      //       i.e. it's stalling on an action it should be taking
      // Either way: synthetic user-message + forced tool_choice next turn.
      const calledToolThisTurn = completion.content.some((b) => b.type === 'tool_use');
      const announced = looksLikeAnnouncement(textOut);
      const greenlit = looksLikeGreenlight(lastUserText);
      if (
        !calledToolThisTurn &&
        !kickAttempted &&
        activeTools.length > 0 &&
        (announced || greenlit)
      ) {
        console.log(`[chat] kick — ${announced ? 'announcement' : 'greenlight'} without tool call, re-prompting with forced tool_choice`);
        kickAttempted = true;
        conversation.push({
          role: 'user',
          content:
            'STOP. You just stalled. Do not reply with text. Right now, this turn, call the tool(s) the action requires. ' +
            'If Jordan greenlit a hiring batch, emit hire_agent tool_use blocks (multiple in one turn is fine). ' +
            'No preamble. No "let me". Just the tool calls.',
        });
        continue;
      }

      finalText = textOut;
      break;
    }
    } // end Anthropic path
    console.log(`[chat] reply done (${activeAgent ? `agent:${activeAgent.name}` : 'CEO'}) — ${toolCallCount} tool call(s) this turn${hitTurnCap ? ' [HIT TURN CAP]' : ''}${kickAttempted ? ' [KICKED]' : ''}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `LLM call failed (${MODEL_PROVIDER}): ${msg}` },
      { status: 502 }
    );
  }

  // Fallbacks for the no-final-text case. Two paths:
  //   1. We hit the turn cap mid-batch → use interim text + "keep going" tail.
  //   2. Empty finalText for any other reason (e.g. forced tool_choice turn
  //      returned only tool_use blocks that didn't survive the loop) → use
  //      whatever interim text we collected so Jordan sees SOMETHING.
  // Only 502 if we have literally nothing — neither final nor interim text.
  if (!finalText) {
    if (interimText.length) {
      const trailer = hitTurnCap
        ? `\n\n— Hit tool-turn cap after ${toolCallCount} action(s). Reply "keep going" to continue.`
        : toolCallCount > 0
          ? `\n\n— ${toolCallCount} action(s) executed.`
          : '';
      finalText = `${interimText.join('\n').trim()}${trailer}`;
    } else {
      return NextResponse.json(
        { error: 'Anthropic returned no text content (or hit tool-use turn limit)' },
        { status: 502 }
      );
    }
  }

  // 4. Persist assistant reply
  const { data: saved, error: insertAssistErr } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      role: 'assistant',
      content: finalText,
    })
    .select('id, thread_id, role, content, created_at')
    .single();

  if (insertAssistErr || !saved) {
    return NextResponse.json(
      {
        error: `Failed to save assistant message: ${insertAssistErr?.message ?? 'unknown'}`,
      },
      { status: 500 }
    );
  }

  // 5. Reply
  return NextResponse.json({
    id: saved.id,
    threadId: saved.thread_id,
    role: saved.role,
    content: saved.content,
    timestamp: saved.created_at,
  });
}
