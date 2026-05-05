// HR — the typed functions Hermes calls when it executes hire/train/fire/etc.
//
// These are the only things that touch the agents table for write. Hermes
// handlers in lib/hermes/handlers.ts thinly wrap these. The CEO Agent never
// calls them directly — it goes through proposeAction() so every hire and
// fire is in the audit log.
//
// Why a separate module rather than inline in handlers.ts:
//   1. Reusable from /api/agents/[id]/[action] route handlers (the buttons
//      on the /agents page) without a chat-tool round-trip
//   2. Pure functions, easy to test
//   3. handlers.ts stays a 1-3 liner registry as designed

import { createAdminClient, createClient } from '@/lib/supabase/server';
import type { AgentDivision, AgentStatus } from '@/lib/types';

async function db() {
  return createAdminClient() ?? (await createClient());
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export interface HireAgentInput {
  name: string;
  role: string;
  division: AgentDivision;
  systemPrompt: string;
  capabilities?: string[];
  avatar?: string;       // emoji, defaults to 🤖
  monthlyCost?: number;  // 0 if free / part of Claude allowance
  hireReason?: string;   // why we're hiring this agent
}

export interface TrainAgentInput {
  agentId: string;
  /** What's being changed. */
  kind: 'prompt_rewrite' | 'capability_add' | 'capability_remove' | 'feedback';
  /** Jordan's instruction / reason for the training pass. */
  feedback: string;
  /** New full system prompt (only for prompt_rewrite). */
  newPrompt?: string;
  /** Capability to add or remove (only for capability_*). */
  capability?: string;
  trainedBy?: string;
}

export interface FireAgentInput {
  agentId: string;
  reason: string;
}

export interface SetStatusInput {
  agentId: string;
  status: AgentStatus;
  reason?: string;
}

// ─── Hire ────────────────────────────────────────────────────────────────────

export async function hireAgent(input: HireAgentInput) {
  if (!input.name?.trim())          throw new Error('name is required');
  if (!input.role?.trim())          throw new Error('role is required');
  if (!input.division)              throw new Error('division is required');
  if (!input.systemPrompt?.trim())  throw new Error('systemPrompt is required');

  const supabase = await db();

  // Dedupe guard — refuse if a non-killed agent already has this name.
  // The CEO Agent retries mid-batch sometimes and we don't want twin Foremen.
  // Killed agents keep their rows for the audit trail, so we only check live ones.
  const { data: existing } = await supabase
    .from('agents')
    .select('id, name, status')
    .ilike('name', input.name.trim())
    .neq('status', 'killed')
    .maybeSingle();
  if (existing) {
    throw new Error(
      `agent named "${input.name}" already exists (id=${existing.id}, status=${existing.status}). Pick a different name or fire the existing one first.`,
    );
  }

  const { data, error } = await supabase
    .from('agents')
    .insert({
      name:           input.name,
      role:           input.role,
      division:       input.division,
      status:         'active',
      monthly_cost:   input.monthlyCost ?? 0,
      value_created:  0,
      roi:            0,
      recommendation: '',
      capabilities:   input.capabilities ?? [],
      avatar:         input.avatar ?? '🤖',
      system_prompt:  input.systemPrompt,
      hire_reason:    input.hireReason ?? '',
      hired_at:       new Date().toISOString(),
      last_active:    new Date().toISOString(),
    })
    .select('id, name, role, division, status, avatar, capabilities, system_prompt, hire_reason, hired_at')
    .single();

  if (error || !data) throw new Error(`hire failed: ${error?.message ?? 'unknown'}`);
  return data;
}

// ─── Train ───────────────────────────────────────────────────────────────────

export async function trainAgent(input: TrainAgentInput) {
  if (!input.agentId?.trim()) throw new Error('agentId is required');
  if (!input.feedback?.trim()) throw new Error('feedback is required');

  const supabase = await db();

  // Load current state — we snapshot before/after for the audit row.
  const { data: agent, error: loadErr } = await supabase
    .from('agents')
    .select('id, name, system_prompt, capabilities')
    .eq('id', input.agentId)
    .single();
  if (loadErr || !agent) throw new Error(`agent not found: ${loadErr?.message ?? input.agentId}`);

  const beforePrompt = (agent.system_prompt ?? '') as string;
  const beforeCaps = (agent.capabilities ?? []) as string[];
  let afterPrompt = beforePrompt;
  let afterCaps = beforeCaps;

  if (input.kind === 'prompt_rewrite') {
    if (!input.newPrompt?.trim()) throw new Error('newPrompt is required for prompt_rewrite');
    afterPrompt = input.newPrompt;
  } else if (input.kind === 'capability_add') {
    if (!input.capability?.trim()) throw new Error('capability is required');
    if (!beforeCaps.includes(input.capability)) afterCaps = [...beforeCaps, input.capability];
  } else if (input.kind === 'capability_remove') {
    if (!input.capability?.trim()) throw new Error('capability is required');
    afterCaps = beforeCaps.filter((c) => c !== input.capability);
  }
  // 'feedback' kind: no state change, just an audit row. Useful for "this
  // agent did good" / "fix the tone next time" without rewriting anything.

  // Apply the diff.
  if (input.kind !== 'feedback') {
    const { error: updateErr } = await supabase
      .from('agents')
      .update({
        system_prompt: afterPrompt,
        capabilities:  afterCaps,
        last_active:   new Date().toISOString(),
      })
      .eq('id', input.agentId);
    if (updateErr) throw new Error(`train failed: ${updateErr.message}`);
  }

  // Audit row.
  const { data: event, error: eventErr } = await supabase
    .from('training_events')
    .insert({
      agent_id:      input.agentId,
      kind:          input.kind,
      feedback:      input.feedback,
      before_prompt: input.kind === 'prompt_rewrite' ? beforePrompt : null,
      after_prompt:  input.kind === 'prompt_rewrite' ? afterPrompt  : null,
      capability:    input.capability ?? null,
      trained_by:    input.trainedBy ?? 'jordan',
    })
    .select('id, kind, feedback, created_at')
    .single();
  if (eventErr) throw new Error(`training_events insert failed: ${eventErr.message}`);

  return {
    agentId: input.agentId,
    agentName: (agent.name ?? '') as string,
    eventId: event?.id,
    kind: input.kind,
    summary: trainingSummary(input.kind, input.capability),
  };
}

function trainingSummary(kind: TrainAgentInput['kind'], capability?: string): string {
  switch (kind) {
    case 'prompt_rewrite':    return 'system prompt rewritten';
    case 'capability_add':    return `capability added: ${capability ?? '?'}`;
    case 'capability_remove': return `capability removed: ${capability ?? '?'}`;
    case 'feedback':          return 'feedback logged (no prompt change)';
  }
}

// ─── Fire ────────────────────────────────────────────────────────────────────

export async function fireAgent(input: FireAgentInput) {
  if (!input.agentId?.trim()) throw new Error('agentId is required');
  if (!input.reason?.trim()) throw new Error('reason is required (no firing without a reason)');

  const supabase = await db();
  const { data, error } = await supabase
    .from('agents')
    .update({
      status:      'killed',
      fire_reason: input.reason,
      fired_at:    new Date().toISOString(),
    })
    .eq('id', input.agentId)
    .select('id, name, status, fire_reason, fired_at')
    .single();
  if (error || !data) throw new Error(`fire failed: ${error?.message ?? 'agent not found'}`);
  return data;
}

// ─── Bench / Activate ────────────────────────────────────────────────────────

export async function setAgentStatus(input: SetStatusInput) {
  if (!input.agentId?.trim()) throw new Error('agentId is required');

  const supabase = await db();
  const update: Record<string, unknown> = { status: input.status };
  if (input.status === 'killed' && input.reason) {
    update.fire_reason = input.reason;
    update.fired_at    = new Date().toISOString();
  }
  if (input.status !== 'killed') {
    update.last_active = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('agents')
    .update(update)
    .eq('id', input.agentId)
    .select('id, name, status')
    .single();
  if (error || !data) throw new Error(`status change failed: ${error?.message ?? 'agent not found'}`);
  return data;
}

// ─── Read ────────────────────────────────────────────────────────────────────
// Convenience for the CEO Agent's list_agents tool — returns lightweight
// rows so we don't dump every system prompt into the model context.

export async function listAgentsLite() {
  const supabase = await db();
  // Excludes killed agents — the CEO shouldn't see fired staff in its roster.
  // Their rows live on for the audit trail; query them directly if needed.
  const { data, error } = await supabase
    .from('agents')
    .select('id, name, role, division, status, capabilities, monthly_cost, value_created, roi, avatar, hired_at, fired_at, fire_reason')
    .neq('status', 'killed')
    .order('hired_at', { ascending: false });
  if (error) throw new Error(`list agents failed: ${error.message}`);
  return data ?? [];
}

export async function getAgentDetail(agentId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();
  if (error || !data) throw new Error(`agent not found: ${error?.message ?? agentId}`);
  return data;
}
