// GET /api/integrations/google/calendar/events
//
// Returns upcoming events from Jordan's primary calendar.
//
// Query params (all optional):
//   timeMin     ISO8601 — defaults to now
//   timeMax     ISO8601 — defaults to now + 7 days
//   maxResults  number  — defaults to 50
//
// Response: { events: CalendarEvent[] } | { error: string, status: 'not_connected'|'expired'|'error' }
//
// This endpoint is the seam between the CEO Agent's tool-use call and the
// real Google Calendar API. The agent invokes a `list_calendar_events` tool;
// /api/chat hits this URL; tokens are refreshed transparently.

import { NextResponse } from 'next/server';
import { listUpcomingEvents } from '@/lib/integrations/google';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const timeMinRaw    = url.searchParams.get('timeMin');
  const timeMaxRaw    = url.searchParams.get('timeMax');
  const maxResultsRaw = url.searchParams.get('maxResults');

  const opts: { timeMin?: Date; timeMax?: Date; maxResults?: number } = {};
  if (timeMinRaw)    opts.timeMin    = new Date(timeMinRaw);
  if (timeMaxRaw)    opts.timeMax    = new Date(timeMaxRaw);
  if (maxResultsRaw) opts.maxResults = Math.max(1, Math.min(100, Number(maxResultsRaw)));

  try {
    const events = await listUpcomingEvents(opts);
    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // Distinguish "not connected" from "actual failure" so the UI can prompt
    // a connect instead of showing a scary error.
    const status = message.includes('not connected') ? 'not_connected' : 'error';
    return NextResponse.json({ error: message, status }, { status: 502 });
  }
}
