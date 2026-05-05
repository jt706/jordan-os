// GET /api/agents/:id/training
// Returns the most recent training_events for one agent (newest first).
//
// Used by the agent card's "History" expander on /agents.

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
    .from('training_events')
    .select('id, kind, feedback, before_prompt, after_prompt, capability, trained_by, created_at')
    .eq('agent_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
