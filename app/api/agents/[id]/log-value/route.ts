// POST /api/agents/:id/log-value
//   body: { amount: number, note?: string }
//
// Records a value-attribution event for one agent and bumps the rolled-up
// agents.value_created + roi columns so the ROI chip stays honest.
//
// Direct write (no Hermes audit row) — value-logging is a lightweight ledger
// entry, not a state-changing action like hire/fire. The value_log table is
// itself the audit trail.
//
// GET also supported: returns the recent ledger entries for this agent.

import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function db() {
  return createAdminClient() ?? (await createClient());
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'agent id required' }, { status: 400 });

  const limitParam = new URL(req.url).searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam ?? '20', 10) || 20, 1), 100);

  const supabase = await db();
  const { data, error } = await supabase
    .from('value_log')
    .select('id, amount, note, created_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'agent id required' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: 'amount must be a finite number' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';

  const supabase = await db();

  // Confirm agent exists.
  const { data: agent, error: loadErr } = await supabase
    .from('agents')
    .select('id, monthly_cost, value_created')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!agent)  return NextResponse.json({ error: 'agent not found' }, { status: 404 });

  // 1. Append the ledger entry.
  const { data: entry, error: insertErr } = await supabase
    .from('value_log')
    .insert({ agent_id: id, amount, note })
    .select('id, amount, note, created_at')
    .single();
  if (insertErr || !entry) {
    return NextResponse.json(
      { error: `log failed: ${insertErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  // 2. Roll up: new total = old total + amount; ROI = total / monthly_cost.
  const newTotal = Number(agent.value_created ?? 0) + amount;
  const cost = Number(agent.monthly_cost ?? 0);
  const newRoi = cost > 0 ? Number((newTotal / cost).toFixed(2)) : 0;

  const { error: updateErr } = await supabase
    .from('agents')
    .update({
      value_created: newTotal,
      roi:           newRoi,
      last_active:   new Date().toISOString(),
    })
    .eq('id', id);
  if (updateErr) {
    return NextResponse.json(
      { error: `roll-up failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    entry,
    rollup: { value_created: newTotal, roi: newRoi },
  });
}
