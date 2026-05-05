// GET /api/agent-templates
// Returns lightweight summaries for every agent template in the AITMPL
// registry. The registry is cached in-memory for an hour.

import { NextResponse } from 'next/server';
import { listAgentTemplates } from '@/lib/agent-templates';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const templates = await listAgentTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ templates: [], error: msg }, { status: 200 });
    // 200 + empty list — the UI degrades gracefully to manual hire.
  }
}
