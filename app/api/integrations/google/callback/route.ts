// GET /api/integrations/google/callback?code=...&state=...
//
// Google redirects here after the user grants consent. We:
//   1. Verify the `state` matches the cookie set in /start (CSRF check)
//   2. Exchange the `code` for tokens
//   3. Fetch the user's Google email so we know which account is connected
//   4. Upsert into the `integrations` table
//   5. Redirect back to /integrations with a success/error flag

import { NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
} from '@/lib/integrations/google';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const STATE_COOKIE = 'gcal_oauth_state';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state');
  const error  = url.searchParams.get('error');

  // User declined or Google rejected the request.
  if (error) {
    return NextResponse.redirect(
      `${appUrl}/integrations?google=error&reason=${encodeURIComponent(error)}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/integrations?google=error&reason=missing_code`);
  }

  // CSRF: state must match the cookie we set in /start.
  const stateCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`))
    ?.split('=')[1];

  if (!stateCookie || stateCookie !== state) {
    return NextResponse.redirect(`${appUrl}/integrations?google=error&reason=state_mismatch`);
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/integrations?google=error&reason=missing_credentials`);
  }

  const redirectUri = `${appUrl}/api/integrations/google/callback`;

  // Exchange the code for tokens.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'token_exchange_failed';
    return NextResponse.redirect(
      `${appUrl}/integrations?google=error&reason=${encodeURIComponent(reason)}`
    );
  }

  if (!tokens.refresh_token) {
    // We always pass prompt=consent in /start, so this shouldn't happen — but
    // if it does, the integration would be useless without a refresh_token.
    return NextResponse.redirect(`${appUrl}/integrations?google=error&reason=no_refresh_token`);
  }

  // Identify which Google account just consented.
  let accountEmail: string | null = null;
  try {
    const userInfo = await fetchUserInfo(tokens.access_token);
    accountEmail = userInfo.email;
  } catch {
    // Non-fatal — we still got valid tokens.
    accountEmail = null;
  }

  // Upsert the integration row. Use admin client if we have one (bypasses RLS
  // entirely); otherwise fall back to anon client (Stage 1 policy allows it).
  const supabase = createAdminClient() ?? (await createClient());

  // Wipe any existing row first so unique index doesn't collide on reconnect.
  await supabase
    .from('integrations')
    .update({ status: 'disconnected' })
    .eq('provider', 'google_calendar')
    .neq('status', 'disconnected');

  const { error: insertErr } = await supabase.from('integrations').insert({
    provider: 'google_calendar',
    status: 'connected',
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + (tokens.expires_in - 30) * 1000).toISOString(),
    scopes: tokens.scope,
    account_email: accountEmail,
    last_sync_at: null,
    last_error: null,
  });

  if (insertErr) {
    return NextResponse.redirect(
      `${appUrl}/integrations?google=error&reason=${encodeURIComponent(insertErr.message)}`
    );
  }

  // Clear the state cookie and redirect to the settings page with success.
  const response = NextResponse.redirect(`${appUrl}/integrations?google=connected`);
  response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}
