// POST /api/agents/:id/start-thread
//
// Spawn (or reuse) a chat thread bound to a specific agent. While the thread's
// agent_id is set, /api/chat swaps the CEO system prompt for that agent's own
// prompt — so the user is talking with the sub-agent, not the CEO.
//
// Reuse rule: if the user already has an open (un-archived) thread for this
// agent, return it. Otherwise create a fresh one named after the agent.
//
// Returns: { threadId, created: boolean }

import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function db() {
  return createAdminClient() ?? (await createClient());
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'agent id required' }, { status: 400 });

  const supabase = await db();

  // 1. Confirm agent exists and isn't killed.
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, name, role, status')
    .eq('id', id)
    .maybeSingle();
  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
  if (!agent)   return NextResponse.json({ error: 'agent not found' }, { status: 404 });
  if (agent.status === 'killed') {
    return NextResponse.json({ error: 'cannot talk to a killed agent' }, { status: 409 });
  }

  // 2. Reuse an existing thread for this agent if one exists.
  const { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('agent_id', id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ threadId: existing.id, created: false });
  }

  // 3. Create a new thread bound to this agent.
  const title = `${agent.name} — ${agent.role}`;
  const { data: created, error: createErr } = await supabase
    .from('threads')
    .insert({
      title,
      agent_id: id,
      tags: ['agent'],
      pinned: false,
      last_message: '',
    })
    .select('id')
    .single();

  if (createErr || !created) {
    return NextResponse.json(
      { error: `failed to create thread: ${createErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ threadId: created.id, created: true });
}
