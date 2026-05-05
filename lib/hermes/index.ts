// Hermes — the execution layer. Public API:
//
//   proposeAction({ kind, payload, threadId, proposedBy })
//     Inserts an actions row. If the policy says auto-execute, runs it now
//     and returns the result. If approval is required, returns
//     { status: 'pending_approval', actionId } so the caller can tell Jordan
//     to check the Execution page.
//
//   approveAction(actionId, approvedBy?)
//     Moves a pending_approval row to queued, then executes it.
//
//   cancelAction(actionId)
//     Moves a pending_approval row to cancelled. No execution.
//
//   listActions({ status?, limit? })
//     Reads from the actions table for the UI.
//
// Hermes uses the admin client when available (bypasses RLS for trustworthy
// internal writes) and falls back to the cookie-scoped client otherwise.

import { createAdminClient, createClient } from '@/lib/supabase/server';
import { HANDLERS } from './handlers';
import { getPolicy, isActionKind, type ActionKind } from './policy';

export type ActionStatus =
  | 'pending_approval'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ActionRow {
  id: string;
  kind: ActionKind;
  payload: Record<string, unknown>;
  status: ActionStatus;
  requires_approval: boolean;
  thread_id: string | null;
  proposed_by: string;
  approved_at: string | null;
  approved_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposeResult {
  actionId: string;
  status: 'completed' | 'failed' | 'pending_approval';
  result?: unknown;
  error?: string;
}

async function db() {
  return createAdminClient() ?? (await createClient());
}

// ─── Propose ─────────────────────────────────────────────────────────────────

export async function proposeAction(opts: {
  kind: ActionKind;
  payload: Record<string, unknown>;
  threadId?: string | null;
  proposedBy?: string;
}): Promise<ProposeResult> {
  const policy = getPolicy(opts.kind);
  const supabase = await db();

  const initialStatus: ActionStatus = policy.requiresApproval ? 'pending_approval' : 'queued';

  const { data: row, error: insertErr } = await supabase
    .from('actions')
    .insert({
      kind: opts.kind,
      payload: opts.payload,
      status: initialStatus,
      requires_approval: policy.requiresApproval,
      thread_id: opts.threadId ?? null,
      proposed_by: opts.proposedBy ?? 'ceo_agent',
    })
    .select()
    .single();

  if (insertErr || !row) {
    throw new Error(`Hermes: failed to queue action: ${insertErr?.message ?? 'unknown error'}`);
  }

  if (policy.requiresApproval) {
    return { actionId: row.id as string, status: 'pending_approval' };
  }

  return await executeAction(row.id as string);
}

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function executeAction(actionId: string): Promise<ProposeResult> {
  const supabase = await db();

  // Mark as running (only if currently queued — avoids racing on double-execute)
  const { data: row, error: lockErr } = await supabase
    .from('actions')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', actionId)
    .eq('status', 'queued')
    .select()
    .single();

  if (lockErr || !row) {
    return {
      actionId,
      status: 'failed',
      error: `Hermes: action not in 'queued' state (got: ${lockErr?.message ?? 'unknown'})`,
    };
  }

  // Supabase rows aren't strongly typed yet (no generated types), so narrow
  // the kind to ActionKind ourselves before indexing the handler registry.
  if (!isActionKind(row.kind)) {
    await markFailed(actionId, `Unknown action kind: ${row.kind}`);
    return { actionId, status: 'failed', error: `Unknown action kind: ${row.kind}` };
  }
  const kind: ActionKind = row.kind;

  const handler = HANDLERS[kind];
  if (!handler) {
    await markFailed(actionId, `No handler registered for: ${kind}`);
    return { actionId, status: 'failed', error: `No handler registered for: ${kind}` };
  }

  try {
    const result = await handler((row.payload ?? {}) as Record<string, unknown>);
    await supabase
      .from('actions')
      .update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', actionId);
    return { actionId, status: 'completed', result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    await markFailed(actionId, msg);
    return { actionId, status: 'failed', error: msg };
  }
}

async function markFailed(actionId: string, error: string) {
  const supabase = await db();
  await supabase
    .from('actions')
    .update({
      status: 'failed',
      error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', actionId);
}

// ─── Approve / Cancel ────────────────────────────────────────────────────────

export async function approveAction(actionId: string, approvedBy: string = 'jordan'): Promise<ProposeResult> {
  const supabase = await db();
  const { data: row, error } = await supabase
    .from('actions')
    .update({
      status: 'queued',
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq('id', actionId)
    .eq('status', 'pending_approval')
    .select()
    .single();

  if (error || !row) {
    return {
      actionId,
      status: 'failed',
      error: `Hermes: cannot approve — action not pending (${error?.message ?? 'not found'})`,
    };
  }

  return await executeAction(actionId);
}

export async function cancelAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await db();
  const { error } = await supabase
    .from('actions')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .eq('status', 'pending_approval');

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function listActions(opts?: {
  status?: ActionStatus | ActionStatus[];
  limit?: number;
}): Promise<ActionRow[]> {
  const supabase = await createClient();
  let q = supabase.from('actions').select('*').order('created_at', { ascending: false });
  if (opts?.status) {
    if (Array.isArray(opts.status)) q = q.in('status', opts.status);
    else q = q.eq('status', opts.status);
  }
  if (opts?.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActionRow[];
}
