// Hermes handler registry — maps action_kind → the function that actually
// performs the side-effect. The runtime contract:
//   - Handlers receive the action's `payload` exactly as inserted
//   - Handlers return a JSON-serialisable result that lands in `result`
//   - Throwing means the action transitions to `failed` with the error message
//
// Keep the registry thin: each handler should be a 1-3 liner that delegates
// to a typed function in lib/integrations or similar. Logic lives there.

import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  type CreateEventInput,
  type UpdateEventInput,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  type CreateTaskInput,
  type UpdateTaskInput,
  createEmailDraft,
  type CreateDraftInput,
} from '@/lib/integrations/google';
import {
  hireAgent,
  trainAgent,
  fireAgent,
  setAgentStatus,
  type HireAgentInput,
  type TrainAgentInput,
} from '@/lib/agents/hr';
import type { AgentDivision } from '@/lib/types';
import type { ActionKind } from './policy';

type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const optStrArr = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

export const HANDLERS: Record<ActionKind, Handler> = {
  create_calendar_event: async (payload) => {
    const input: CreateEventInput = {
      summary:     String(payload.summary ?? ''),
      start:       String(payload.start ?? ''),
      end:         optStr(payload.end),
      description: optStr(payload.description),
      location:    optStr(payload.location),
      timeZone:    optStr(payload.timeZone),
      attendees:   optStrArr(payload.attendees),
    };
    return await createCalendarEvent(input);
  },

  update_calendar_event: async (payload) => {
    if (typeof payload.eventId !== 'string' || !payload.eventId.trim()) {
      throw new Error('eventId is required');
    }
    const input: UpdateEventInput = {
      eventId:     payload.eventId,
      summary:     optStr(payload.summary),
      start:       optStr(payload.start),
      end:         optStr(payload.end),
      description: optStr(payload.description),
      location:    optStr(payload.location),
      timeZone:    optStr(payload.timeZone),
      attendees:   optStrArr(payload.attendees),
    };
    return await updateCalendarEvent(input);
  },

  delete_calendar_event: async (payload) => {
    if (typeof payload.eventId !== 'string' || !payload.eventId.trim()) {
      throw new Error('eventId is required');
    }
    return await deleteCalendarEvent(payload.eventId);
  },

  // ─── Google Tasks ────────────────────────────────────────────────────────
  create_task: async (payload) => {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw new Error('title is required');
    }
    const input: CreateTaskInput = {
      title:      payload.title,
      notes:      optStr(payload.notes),
      due:        optStr(payload.due),
      tasklistId: optStr(payload.tasklistId),
    };
    return await createTask(input);
  },

  update_task: async (payload) => {
    if (typeof payload.taskId !== 'string' || !payload.taskId.trim()) {
      throw new Error('taskId is required');
    }
    const input: UpdateTaskInput = {
      taskId:     payload.taskId,
      title:      optStr(payload.title),
      notes:      optStr(payload.notes),
      due:        optStr(payload.due),
      status:     payload.status === 'completed' || payload.status === 'needsAction'
                    ? payload.status
                    : undefined,
      tasklistId: optStr(payload.tasklistId),
    };
    return await updateTask(input);
  },

  complete_task: async (payload) => {
    if (typeof payload.taskId !== 'string' || !payload.taskId.trim()) {
      throw new Error('taskId is required');
    }
    return await completeTask(payload.taskId, optStr(payload.tasklistId));
  },

  delete_task: async (payload) => {
    if (typeof payload.taskId !== 'string' || !payload.taskId.trim()) {
      throw new Error('taskId is required');
    }
    return await deleteTask(payload.taskId, optStr(payload.tasklistId));
  },

  // ─── HR — agent lifecycle ────────────────────────────────────────────────
  hire_agent: async (payload) => {
    const division = payload.division;
    const validDivisions: AgentDivision[] = ['Strategy', 'Research', 'Execution', 'Finance', 'Marketing', 'Operations', 'Development'];
    if (typeof division !== 'string' || !validDivisions.includes(division as AgentDivision)) {
      throw new Error(`division must be one of: ${validDivisions.join(', ')}`);
    }
    const input: HireAgentInput = {
      name:         String(payload.name ?? ''),
      role:         String(payload.role ?? ''),
      division:     division as AgentDivision,
      systemPrompt: String(payload.systemPrompt ?? ''),
      capabilities: optStrArr(payload.capabilities),
      avatar:       optStr(payload.avatar),
      monthlyCost:  typeof payload.monthlyCost === 'number' ? payload.monthlyCost : undefined,
      hireReason:   optStr(payload.hireReason),
    };
    return await hireAgent(input);
  },

  train_agent: async (payload) => {
    if (typeof payload.agentId !== 'string' || !payload.agentId.trim()) {
      throw new Error('agentId is required');
    }
    const kind = payload.kind;
    const validKinds = ['prompt_rewrite', 'capability_add', 'capability_remove', 'feedback'];
    if (typeof kind !== 'string' || !validKinds.includes(kind)) {
      throw new Error(`kind must be one of: ${validKinds.join(', ')}`);
    }
    const input: TrainAgentInput = {
      agentId:   payload.agentId,
      kind:      kind as TrainAgentInput['kind'],
      feedback:  String(payload.feedback ?? ''),
      newPrompt: optStr(payload.newPrompt),
      capability: optStr(payload.capability),
      trainedBy: optStr(payload.trainedBy),
    };
    return await trainAgent(input);
  },

  fire_agent: async (payload) => {
    if (typeof payload.agentId !== 'string' || !payload.agentId.trim()) {
      throw new Error('agentId is required');
    }
    if (typeof payload.reason !== 'string' || !payload.reason.trim()) {
      throw new Error('reason is required (no firing without a reason)');
    }
    return await fireAgent({ agentId: payload.agentId, reason: payload.reason });
  },

  bench_agent: async (payload) => {
    if (typeof payload.agentId !== 'string' || !payload.agentId.trim()) {
      throw new Error('agentId is required');
    }
    return await setAgentStatus({ agentId: payload.agentId, status: 'benched' });
  },

  activate_agent: async (payload) => {
    if (typeof payload.agentId !== 'string' || !payload.agentId.trim()) {
      throw new Error('agentId is required');
    }
    return await setAgentStatus({ agentId: payload.agentId, status: 'active' });
  },

  // ─── Gmail draft ─────────────────────────────────────────────────────────
  create_email_draft: async (payload) => {
    // `to` can be string or string[]; same for cc/bcc.
    const to = Array.isArray(payload.to) ? optStrArr(payload.to) : optStr(payload.to);
    if (!to || (Array.isArray(to) && to.length === 0)) {
      throw new Error('to is required');
    }
    if (typeof payload.subject !== 'string') {
      throw new Error('subject is required');
    }
    if (typeof payload.body !== 'string') {
      throw new Error('body is required');
    }
    const input: CreateDraftInput = {
      to,
      subject: payload.subject,
      body:    payload.body,
      cc:      Array.isArray(payload.cc)  ? optStrArr(payload.cc)  : optStr(payload.cc),
      bcc:     Array.isArray(payload.bcc) ? optStrArr(payload.bcc) : optStr(payload.bcc),
    };
    return await createEmailDraft(input);
  },
};
