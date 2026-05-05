// GET /api/agent-templates/:id
// Returns the full template (including the system prompt content body).

import { NextResponse } from 'next/server';
import { getAgentTemplate } from '@/lib/agent-templates';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    const template = await getAgentTemplate(id);
    if (!template) return NextResponse.json({ error: 'template not found' }, { status: 404 });
    return NextResponse.json({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
