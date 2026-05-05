// Hermes policy — the single source of truth for "does this need Jordan's
// approval, or can Hermes just run it".
//
// Adding a new action kind?
//   1. Add it to the action_kind enum in supabase/migrations/0003 (and apply)
//   2. Add an entry here with sane defaults
//   3. Wire a handler in lib/hermes/handlers.ts
//   4. Expose a tool in app/api/chat/route.ts that calls proposeAction

export type ActionKind =
  | 'create_calendar_event'
  | 'update_calendar_event'
  | 'delete_calendar_event'
  | 'create_task'
  | 'update_task'
  | 'complete_task'
  | 'delete_task'
  | 'create_email_draft'
  | 'hire_agent'
  | 'train_agent'
  | 'fire_agent'
  | 'bench_agent'
  | 'activate_agent';

export interface ActionPolicy {
  /** If true, Hermes inserts the row as `pending_approval` and waits for
   *  Jordan to click Approve on the Execution page before running. */
  requiresApproval: boolean;
  /** Bucket the UI groups by. Loose label, not enforced. */
  category: 'calendar' | 'email' | 'tasks' | 'money' | 'system' | 'hr';
  /** Short human-readable description shown in the queue UI. */
  description: string;
  /** Natural-language summary builder for a queue row. Keep it short — this
   *  is what Jordan sees in the Execution list. */
  summarize: (payload: Record<string, unknown>) => string;
}

export const POLICIES: Record<ActionKind, ActionPolicy> = {
  create_calendar_event: {
    requiresApproval: false, // low risk; Jordan can delete from Calendar if wrong
    category: 'calendar',
    description: 'Create a Google Calendar event',
    summarize: (p) => {
      const summary = typeof p.summary === 'string' ? p.summary : 'Event';
      const start = typeof p.start === 'string' ? p.start : '';
      return start ? `${summary} — ${start}` : summary;
    },
  },
  update_calendar_event: {
    requiresApproval: false, // matches create — flip to true if you want a safety net
    category: 'calendar',
    description: 'Update a Google Calendar event',
    summarize: (p) => {
      const id = typeof p.eventId === 'string' ? p.eventId.slice(0, 8) : 'unknown';
      const summary = typeof p.summary === 'string' ? p.summary : null;
      return summary ? `Update event → ${summary}` : `Update event ${id}…`;
    },
  },
  delete_calendar_event: {
    // Set to false per Jordan's preference (auto-execute everything calendar).
    // FLIP TO TRUE if accidental deletes start happening — the Approve UI in
    // /execution is already wired and waiting.
    requiresApproval: false,
    category: 'calendar',
    description: 'Delete a Google Calendar event',
    summarize: (p) => {
      const id = typeof p.eventId === 'string' ? p.eventId.slice(0, 12) : 'unknown';
      return `Delete event ${id}…`;
    },
  },

  // ─── Google Tasks ──────────────────────────────────────────────────────────
  // Same auto-execute stance as calendar — low blast radius, easy to undo
  // in the Tasks UI if the agent gets it wrong.
  create_task: {
    requiresApproval: false,
    category: 'tasks',
    description: 'Create a Google Task',
    summarize: (p) => {
      const title = typeof p.title === 'string' ? p.title : 'Task';
      const due = typeof p.due === 'string' ? p.due.slice(0, 10) : '';
      return due ? `${title} — due ${due}` : title;
    },
  },
  update_task: {
    requiresApproval: false,
    category: 'tasks',
    description: 'Update a Google Task',
    summarize: (p) => {
      const id = typeof p.taskId === 'string' ? p.taskId.slice(0, 8) : 'unknown';
      const title = typeof p.title === 'string' ? p.title : null;
      return title ? `Update task → ${title}` : `Update task ${id}…`;
    },
  },
  complete_task: {
    requiresApproval: false,
    category: 'tasks',
    description: 'Mark a Google Task complete',
    summarize: (p) => {
      const id = typeof p.taskId === 'string' ? p.taskId.slice(0, 8) : 'unknown';
      return `Complete task ${id}…`;
    },
  },
  delete_task: {
    requiresApproval: false,
    category: 'tasks',
    description: 'Delete a Google Task',
    summarize: (p) => {
      const id = typeof p.taskId === 'string' ? p.taskId.slice(0, 12) : 'unknown';
      return `Delete task ${id}…`;
    },
  },

  // ─── HR — agent lifecycle ──────────────────────────────────────────────────
  // Policy stance:
  //   • hire_agent      — auto-execute. Adding a row is reversible (fire later).
  //   • train_agent     — auto-execute. Every change is in training_events for diff/replay.
  //   • bench_agent     — auto-execute. Reversible.
  //   • activate_agent  — auto-execute. Reversible.
  //   • fire_agent      — REQUIRES APPROVAL. Killing an agent is the most material
  //                       HR action and should never happen without Jordan's eyes
  //                       on the row. It's also the action where "I changed my mind"
  //                       is most likely. Set to false later if Jordan finds the
  //                       gate too noisy in practice.
  hire_agent: {
    requiresApproval: false,
    category: 'hr',
    description: 'Hire a new AI agent (insert into agents table)',
    summarize: (p) => {
      const name = typeof p.name === 'string' ? p.name : 'Unnamed';
      const role = typeof p.role === 'string' ? ` — ${p.role}` : '';
      return `Hire ${name}${role}`;
    },
  },
  train_agent: {
    requiresApproval: false,
    category: 'hr',
    description: 'Train an agent (rewrite prompt, add/remove capability, or log feedback)',
    summarize: (p) => {
      const id = typeof p.agentId === 'string' ? p.agentId.slice(0, 8) : 'unknown';
      const kind = typeof p.kind === 'string' ? p.kind : 'feedback';
      return `Train ${id}… (${kind})`;
    },
  },
  fire_agent: {
    requiresApproval: true,
    category: 'hr',
    description: 'Fire an agent (status → killed, with reason)',
    summarize: (p) => {
      const id = typeof p.agentId === 'string' ? p.agentId.slice(0, 8) : 'unknown';
      const reason = typeof p.reason === 'string' ? p.reason.slice(0, 60) : '';
      return `Fire ${id}… — ${reason}`;
    },
  },
  bench_agent: {
    requiresApproval: false,
    category: 'hr',
    description: 'Bench an agent (status → benched, reversible)',
    summarize: (p) => {
      const id = typeof p.agentId === 'string' ? p.agentId.slice(0, 8) : 'unknown';
      return `Bench ${id}…`;
    },
  },
  activate_agent: {
    requiresApproval: false,
    category: 'hr',
    description: 'Activate an agent (status → active)',
    summarize: (p) => {
      const id = typeof p.agentId === 'string' ? p.agentId.slice(0, 8) : 'unknown';
      return `Activate ${id}…`;
    },
  },

  // ─── Gmail (draft only) ────────────────────────────────────────────────────
  // Auto-execute is safe here BECAUSE the OAuth scope is `gmail.compose` —
  // physically cannot send mail, only stage drafts. The draft itself is the
  // approval gate: Jordan reviews in his Drafts folder and clicks Send.
  create_email_draft: {
    requiresApproval: false,
    category: 'email',
    description: 'Stage a Gmail draft (Jordan reviews + sends manually)',
    summarize: (p) => {
      const to = Array.isArray(p.to)
        ? (p.to as unknown[]).filter((x): x is string => typeof x === 'string').join(', ')
        : typeof p.to === 'string' ? p.to : 'unknown';
      const subj = typeof p.subject === 'string' ? p.subject : '(no subject)';
      return `Draft → ${to}: ${subj}`;
    },
  },
};

export function getPolicy(kind: ActionKind): ActionPolicy {
  return POLICIES[kind];
}

/** Type guard for runtime validation when reading from the DB. */
export function isActionKind(value: unknown): value is ActionKind {
  return typeof value === 'string' && value in POLICIES;
}
