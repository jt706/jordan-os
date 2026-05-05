// POST /api/agents/hire
// Body: { name, role, division, systemPrompt, capabilities?, avatar?, monthlyCost?, hireReason? }
// Routes through Hermes for an audit row, then returns the result.

import { NextResponse } from 'next/server';
import { proposeAction } from '@/lib/hermes';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.name !== 'string' || !body.name.trim())
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (typeof body.role !== 'string' || !body.role.trim())
    return NextResponse.json({ error: 'role is required' }, { status: 400 });
  if (typeof body.division !== 'string' || !body.division.trim())
    return NextResponse.json({ error: 'division is required' }, { status: 400 });
  if (typeof body.systemPrompt !== 'string' || !body.systemPrompt.trim())
    return NextResponse.json({ error: 'systemPrompt is required' }, { status: 400 });

  try {
    const result = await proposeAction({
      kind: 'hire_agent',
      payload: body,
      proposedBy: 'jordan',
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
