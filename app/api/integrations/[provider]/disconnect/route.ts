// POST /api/integrations/:provider/disconnect
//
// Marks every active integration row for the given provider as disconnected.
// This doesn't actually revoke the token on Google's side — Jordan can do
// that from https://myaccount.google.com/permissions if he wants — but it
// does stop Hermes from using it.

import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ALLOWED = new Set([
  'google_calendar',
  'gmail',
  'apple_reminders',
  'google_tasks',
  'todoist',
  'asana',
  'linear',
]);

export async function POST(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  if (!ALLOWED.has(provider)) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 400 });
  }

  const supabase = createAdminClient() ?? (await createClient());

  const { error } = await supabase
    .from('integrations')
    .update({
      status: 'disconnected',
      access_token: null,
      refresh_token: null,
      expires_at: null,
    })
    .eq('provider', provider);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
