// POST /api/actions/:id/cancel
// Moves a pending_approval row to cancelled. No execution.

import { NextResponse } from 'next/server';
import { cancelAction } from '@/lib/hermes';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'action id required' }, { status: 400 });
  }
  const result = await cancelAction(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'cancel failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
