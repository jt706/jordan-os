// POST /api/agents/:id/:action
//   action ∈ { bench, activate, fire, train }
// Routes the click to Hermes (which inserts the audit row, then runs).
//
// fire requires a body: { reason: string }   — and comes back pending_approval
// train requires a body: { kind, feedback, newPrompt?, capability? }
// bench / activate take no body.
//
// Returns Hermes' ProposeResult so the client can update inline.

import { NextResponse } from 'next/server';
import { proposeAction } from '@/lib/hermes';
import type { ActionKind } from '@/lib/hermes/policy';

export const runtime = 'nodejs';

const VALID = new Set(['bench', 'activate', 'fire', 'train']);

const ACTION_TO_KIND: Record<string, ActionKind> = {
  bench:    'bench_agent',
  activate: 'activate_agent',
  fire:     'fire_agent',
  train:    'train_agent',
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const { id, action } = await params;
  if (!id) return NextResponse.json({ error: 'agent id required' }, { status: 400 });
  if (!VALID.has(action)) {
    return NextResponse.json(
      { error: `unknown action: ${action} (expected one of: bench, activate, fire, train)` },
      { status: 400 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.headers.get('content-length') !== '0' && req.headers.get('content-length') !== null) {
      body = await req.json();
    }
  } catch {
    // empty body is fine for bench/activate
  }

  // Per-action validation
  if (action === 'fire') {
    if (typeof body.reason !== 'string' || !body.reason.trim()) {
      return NextResponse.json({ error: 'reason is required to fire' }, { status: 400 });
    }
  }
  if (action === 'train') {
    const kind = body.kind;
    if (typeof kind !== 'string' || !['prompt_rewrite', 'capability_add', 'capability_remove', 'feedback'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be prompt_rewrite | capability_add | capability_remove | feedback' }, { status: 400 });
    }
    if (typeof body.feedback !== 'string' || !body.feedback.trim()) {
      return NextResponse.json({ error: 'feedback is required' }, { status: 400 });
    }
  }

  const kind = ACTION_TO_KIND[action];
  const payload: Record<string, unknown> = { agentId: id, ...body };

  try {
    const result = await proposeAction({
      kind,
      payload,
      proposedBy: 'jordan', // direct user click from /agents UI
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
