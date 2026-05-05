// POST /api/actions/:id/approve
// Moves a pending_approval row to queued and runs the handler.
// Returns Hermes' ProposeResult so the UI can update inline.

import { NextResponse } from 'next/server';
import { approveAction } from '@/lib/hermes';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'action id required' }, { status: 400 });
  }
  try {
    const result = await approveAction(id);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
