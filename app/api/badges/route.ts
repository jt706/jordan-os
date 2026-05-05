// GET /api/badges
// Live counts for the sidebar badges. Cheap to run, no auth gate.
// - decisions: rows in `decisions` with status = 'pending'
// - execution: rows in `actions`   with status = 'pending_approval'
//
// Fails open: any query error returns zeros so the sidebar never shows a
// stale or scary badge during a transient outage.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();

    const [decisionsRes, actionsRes] = await Promise.all([
      supabase
        .from('decisions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('actions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_approval'),
    ]);

    return NextResponse.json({
      decisions: decisionsRes.count ?? 0,
      execution: actionsRes.count ?? 0,
    });
  } catch {
    return NextResponse.json({ decisions: 0, execution: 0 });
  }
}
