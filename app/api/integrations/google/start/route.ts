// GET /api/integrations/google/start
//
// Kicks off the Google OAuth flow. We generate a CSRF token, set it as an
// HttpOnly cookie, and redirect the browser to Google's consent screen.
// Google sends the user back to /api/integrations/google/callback with `?code`
// and `?state` — that route verifies state, exchanges the code, and stores
// the refresh_token in Supabase.

import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/integrations/google';

export const runtime = 'nodejs';

const STATE_COOKIE = 'gcal_oauth_state';

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID is not set in .env.local' },
      { status: 500 }
    );
  }

  // 32 hex chars of randomness to bind the callback to this start request.
  const state = crypto.randomUUID().replace(/-/g, '');
  const redirectUri = `${appUrl}/api/integrations/google/callback`;

  const authUrl = buildAuthUrl({ clientId, redirectUri, state });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    maxAge: 600, // 10 min
    path: '/',
  });
  return response;
}
