// Google OAuth + Calendar helpers for Hermes.
//
// Single-user design: there's one Supabase row in `integrations` with
// provider='google_calendar' that stores the refresh_token. We refresh the
// access_token on demand whenever it's expired or about to expire.
//
// All functions are server-only (they use the @supabase/ssr server client and
// hit Google's APIs directly with fetch — no googleapis SDK needed).

import { createAdminClient, createClient } from '@/lib/supabase/server';

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO  = 'https://openidconnect.googleapis.com/v1/userinfo';

// Scopes Hermes asks Google for.
// `calendar.events` — read + write events (no calendar admin).
// `tasks`           — read + write Google Tasks.
// `gmail.compose`   — create / read / modify DRAFTS only. Cannot send mail.
//                     This is the deliberate safety boundary: even if the
//                     agent goes rogue, it physically cannot fire an email.
//                     The user reviews each draft in Gmail before sending.
// `gmail.readonly`  — read inbox / threads / labels. Cannot modify or send.
//                     Used for searching and summarising existing email.
// `openid` + `email` identify which Google account Jordan connected.
//
// NOTE: When you change scopes, Jordan needs to disconnect and reconnect on
// /integrations so Google's consent screen re-grants the new permissions.
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// ─── OAuth URL builders ──────────────────────────────────────────────────────

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    // `offline` + `prompt=consent` → Google returns a refresh_token even on
    // re-auth. Without these, you only get a refresh_token on the *first*
    // consent, which is brittle in dev.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES.join(' '),
    state: opts.state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ─── Token exchange ──────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;       // seconds
  refresh_token?: string;   // only present on first consent (or with prompt=consent)
  scope: string;
  token_type: 'Bearer';
  id_token?: string;
}

// Exchange an authorisation `code` (from the OAuth callback) for tokens.
export async function exchangeCodeForTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${body}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

// Use a stored refresh_token to mint a new access_token.
export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as Pick<GoogleTokenResponse, 'access_token' | 'expires_in'>;
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in - 30) * 1000),
  };
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string; sub: string }> {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google userinfo failed: ${res.status} ${body}`);
  }
  return (await res.json()) as { email: string; sub: string };
}

// ─── Persisted integration row ───────────────────────────────────────────────

export interface GoogleIntegrationRow {
  id: string;
  provider: 'google_calendar';
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  refresh_token: string | null;
  access_token: string | null;
  expires_at: string | null;
  scopes: string | null;
  account_email: string | null;
  last_error: string | null;
  last_sync_at: string | null;
}

// Returns the single google_calendar integration row, if any.
export async function getGoogleIntegration(): Promise<GoogleIntegrationRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('provider', 'google_calendar')
    .neq('status', 'disconnected')
    .maybeSingle();
  if (error) throw error;
  return (data as GoogleIntegrationRow | null) ?? null;
}

// Returns a valid access_token for Google Calendar — refreshing it if needed.
// Throws if there's no integration or the refresh fails.
export async function getValidAccessToken(): Promise<{ accessToken: string; row: GoogleIntegrationRow }> {
  const row = await getGoogleIntegration();
  if (!row || !row.refresh_token) {
    throw new Error('Google Calendar is not connected. Visit /integrations to connect.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env.local');
  }

  // Reuse the cached access_token if it has > 30 seconds left.
  if (row.access_token && row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 30_000) {
    return { accessToken: row.access_token, row };
  }

  // Refresh.
  let refreshed: { accessToken: string; expiresAt: Date };
  try {
    refreshed = await refreshAccessToken({
      refreshToken: row.refresh_token,
      clientId,
      clientSecret,
    });
  } catch (err) {
    // Mark as expired so the UI can prompt a reconnect.
    const supabase = await createClient();
    await supabase
      .from('integrations')
      .update({
        status: 'expired',
        last_error: err instanceof Error ? err.message : 'unknown refresh error',
      })
      .eq('id', row.id);
    throw err;
  }

  // Cache the new access_token. Use admin client if available so RLS doesn't
  // block the write; falls back to anon client which Stage 1 policy allows.
  const supabase = createAdminClient() ?? (await createClient());
  await supabase
    .from('integrations')
    .update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt.toISOString(),
      status: 'connected',
      last_error: null,
    })
    .eq('id', row.id);

  return { accessToken: refreshed.accessToken, row };
}

// ─── Calendar API ────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;     // ISO8601 — date or dateTime
  end: string;
  allDay: boolean;
  attendees: string[];
  htmlLink: string;
}

interface RawGCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end:   { date?: string; dateTime?: string; timeZone?: string };
  attendees?: { email: string }[];
  htmlLink?: string;
}

// List events on the primary calendar between `timeMin` and `timeMax`.
// Defaults: now → 7 days from now, in chronological order, max 50.
export async function listUpcomingEvents(opts?: {
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
}): Promise<CalendarEvent[]> {
  const { accessToken, row } = await getValidAccessToken();

  const timeMin = (opts?.timeMin ?? new Date()).toISOString();
  const timeMax = (opts?.timeMax ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString();
  const maxResults = String(opts?.maxResults ?? 50);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', maxResults);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar list failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { items?: RawGCalEvent[] };

  // Stamp last_sync_at so the UI can show "synced 2 minutes ago".
  const supabase = createAdminClient() ?? (await createClient());
  await supabase
    .from('integrations')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', row.id);

  return (json.items ?? []).map((e): CalendarEvent => {
    const allDay = Boolean(e.start.date);
    return {
      id: e.id,
      summary: e.summary ?? '(no title)',
      description: e.description,
      location: e.location,
      start: e.start.dateTime ?? e.start.date ?? '',
      end: e.end.dateTime ?? e.end.date ?? '',
      allDay,
      attendees: (e.attendees ?? []).map((a) => a.email),
      htmlLink: e.htmlLink ?? '',
    };
  });
}

// ─── Calendar write ──────────────────────────────────────────────────────────

export interface CreateEventInput {
  summary: string;                  // event title
  start: string;                    // ISO8601, e.g. "2026-05-04T09:00:00"
  end?: string;                     // ISO8601, defaults to start + 1h
  description?: string;
  location?: string;
  attendees?: string[];             // email addresses
  timeZone?: string;                // IANA tz, e.g. "Pacific/Auckland". Defaults to NZ.
}

export interface UpdateEventInput {
  eventId: string;                  // required — get this from listUpcomingEvents
  summary?: string;                 // any field omitted is left unchanged
  start?: string;                   // ISO8601, no offset (timeZone handles it)
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

// Create an event on Jordan's primary calendar.
// Returns the created event's id and html link so the agent can confirm.
export async function createCalendarEvent(input: CreateEventInput): Promise<{
  id: string;
  htmlLink: string;
  start: string;
  end: string;
}> {
  const { accessToken } = await getValidAccessToken();

  const tz = input.timeZone ?? 'Pacific/Auckland';
  const startISO = input.start;
  const endISO = input.end ?? new Date(new Date(input.start).getTime() + 60 * 60 * 1000).toISOString();

  const body = {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: startISO, timeZone: tz },
    end:   { dateTime: endISO,   timeZone: tz },
    attendees: input.attendees?.map((email) => ({ email })),
  };

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Calendar create failed: ${res.status} ${errBody}`);
  }
  const json = (await res.json()) as { id: string; htmlLink: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } };
  return {
    id: json.id,
    htmlLink: json.htmlLink,
    start: json.start.dateTime ?? json.start.date ?? '',
    end:   json.end.dateTime   ?? json.end.date   ?? '',
  };
}

// Update an existing event. Uses PATCH so omitted fields stay as they are.
// Pass `eventId` from a prior listUpcomingEvents result.
export async function updateCalendarEvent(input: UpdateEventInput): Promise<{
  id: string;
  htmlLink: string;
  start: string;
  end: string;
}> {
  const { accessToken } = await getValidAccessToken();
  const tz = input.timeZone ?? 'Pacific/Auckland';

  // Build a sparse body — Google merges with the existing event for PATCH.
  const body: Record<string, unknown> = {};
  if (input.summary     !== undefined) body.summary     = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.location    !== undefined) body.location    = input.location;
  if (input.start       !== undefined) body.start       = { dateTime: input.start, timeZone: tz };
  if (input.end         !== undefined) body.end         = { dateTime: input.end,   timeZone: tz };
  if (input.attendees   !== undefined) body.attendees   = input.attendees.map((email) => ({ email }));

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Calendar update failed: ${res.status} ${errBody}`);
  }
  const json = (await res.json()) as { id: string; htmlLink: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } };
  return {
    id: json.id,
    htmlLink: json.htmlLink,
    start: json.start.dateTime ?? json.start.date ?? '',
    end:   json.end.dateTime   ?? json.end.date   ?? '',
  };
}

// Delete an event from Jordan's primary calendar. Returns the eventId on
// success so the audit log has a useful result to display.
export async function deleteCalendarEvent(eventId: string): Promise<{ id: string; deleted: true }> {
  const { accessToken } = await getValidAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 204 No Content is the success case. 410 Gone means it was already deleted —
  // treat that as success too so the agent doesn't loop trying to clean it up.
  if (res.status !== 204 && res.status !== 410) {
    const errBody = await res.text();
    throw new Error(`Google Calendar delete failed: ${res.status} ${errBody}`);
  }
  return { id: eventId, deleted: true };
}

// ─── Google Tasks API ────────────────────────────────────────────────────────
// We default to the user's primary list ('@default') unless the agent passes a
// specific tasklistId. For most single-user workflows, primary is correct.

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: string;       // RFC3339 — date portion only (Tasks ignores time-of-day)
  status: 'needsAction' | 'completed';
  completed?: string; // ISO timestamp, only when status=completed
  position?: string;
  htmlLink?: string;
}

interface RawGTask {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  completed?: string;
  position?: string;
  selfLink?: string;
  webViewLink?: string;
}

function gtaskToTask(t: RawGTask): Task {
  return {
    id: t.id,
    title: t.title ?? '(untitled)',
    notes: t.notes,
    due: t.due,
    status: t.status ?? 'needsAction',
    completed: t.completed,
    position: t.position,
    htmlLink: t.webViewLink,
  };
}

// List tasks on a list (default: primary). Includes completed by default = false
// because the agent usually wants the open queue, not history.
export async function listTasks(opts?: {
  tasklistId?: string;
  showCompleted?: boolean;
  maxResults?: number;
}): Promise<Task[]> {
  const { accessToken } = await getValidAccessToken();
  const list = opts?.tasklistId ?? '@default';
  const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks`);
  url.searchParams.set('showCompleted', String(opts?.showCompleted ?? false));
  url.searchParams.set('maxResults', String(opts?.maxResults ?? 50));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Tasks list failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { items?: RawGTask[] };
  return (json.items ?? []).map(gtaskToTask);
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  due?: string;            // ISO date e.g. "2026-05-10" or "2026-05-10T00:00:00Z"
  tasklistId?: string;     // defaults to '@default'
}

// Create a task. The Tasks API only stores the date portion of `due` — time
// is silently dropped. That's a Google limitation, not ours.
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const { accessToken } = await getValidAccessToken();
  const list = input.tasklistId ?? '@default';

  // Normalise a bare date "2026-05-10" → "2026-05-10T00:00:00.000Z" since
  // Tasks API requires RFC3339.
  const due = input.due
    ? (input.due.includes('T') ? input.due : `${input.due}T00:00:00.000Z`)
    : undefined;

  const body = {
    title: input.title,
    notes: input.notes,
    due,
  };

  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Tasks create failed: ${res.status} ${errBody}`);
  }
  const json = (await res.json()) as RawGTask;
  return gtaskToTask(json);
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: 'needsAction' | 'completed';
  tasklistId?: string;
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const { accessToken } = await getValidAccessToken();
  const list = input.tasklistId ?? '@default';

  const body: Record<string, unknown> = {};
  if (input.title  !== undefined) body.title  = input.title;
  if (input.notes  !== undefined) body.notes  = input.notes;
  if (input.status !== undefined) body.status = input.status;
  if (input.due    !== undefined) {
    body.due = input.due.includes('T') ? input.due : `${input.due}T00:00:00.000Z`;
  }

  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(input.taskId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Tasks update failed: ${res.status} ${errBody}`);
  }
  return gtaskToTask((await res.json()) as RawGTask);
}

// Convenience: mark a task complete. Just update with status='completed'.
export async function completeTask(taskId: string, tasklistId?: string): Promise<Task> {
  return updateTask({ taskId, status: 'completed', tasklistId });
}

export async function deleteTask(taskId: string, tasklistId?: string): Promise<{ id: string; deleted: true }> {
  const { accessToken } = await getValidAccessToken();
  const list = tasklistId ?? '@default';
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list)}/tasks/${encodeURIComponent(taskId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 204 = success. 404 = already gone — treat as success so we don't loop.
  if (res.status !== 204 && res.status !== 404) {
    const errBody = await res.text();
    throw new Error(`Google Tasks delete failed: ${res.status} ${errBody}`);
  }
  return { id: taskId, deleted: true };
}

// ─── Gmail (draft only — cannot send) ────────────────────────────────────────
// Scope `gmail.compose` lets us create, read, and modify drafts. It does NOT
// permit sending. The draft lands in Jordan's Drafts folder and he hits Send
// himself. That's the entire safety story.

export interface CreateDraftInput {
  to: string | string[];
  subject: string;
  body: string;            // plain text. HTML support can come later.
  cc?: string | string[];
  bcc?: string | string[];
}

// Build an RFC2822 message and base64url-encode it for the Gmail API.
function buildRawMessage(input: CreateDraftInput): string {
  const toList  = Array.isArray(input.to)  ? input.to.join(', ')  : input.to;
  const ccList  = input.cc  ? (Array.isArray(input.cc)  ? input.cc.join(', ')  : input.cc)  : undefined;
  const bccList = input.bcc ? (Array.isArray(input.bcc) ? input.bcc.join(', ') : input.bcc) : undefined;

  const headers: string[] = [
    `To: ${toList}`,
    ccList ? `Cc: ${ccList}` : '',
    bccList ? `Bcc: ${bccList}` : '',
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ].filter(Boolean);

  const message = `${headers.join('\r\n')}\r\n\r\n${input.body}`;

  // base64url: standard base64 with +/= → -_ and padding stripped.
  return Buffer.from(message, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface DraftResult {
  draftId: string;
  messageId: string;
  threadId: string;
  // Direct link to open the draft in Gmail. Format is stable enough for this.
  htmlLink: string;
}

// ─── Gmail (read) ────────────────────────────────────────────────────────────
// Backed by `gmail.readonly` scope — can read messages, threads, and labels;
// cannot modify, label, or send. Useful for "search my inbox for X" and
// "summarise the latest from Y" workflows.

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;        // Gmail's short preview text
  from: string;
  to: string;
  subject: string;
  date: string;
  unread: boolean;
  hasAttachment: boolean;
  labels: string[];
}

export interface GmailMessageFull extends GmailMessageSummary {
  body: string;           // decoded text/plain (or stripped text/html fallback)
  cc: string;
  bcc: string;
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart;
  internalDate?: string;
}

// base64url decode — Gmail uses RFC4648 §5 (URL-safe, no padding).
function decodeB64Url(data: string): string {
  let s = data.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

// Walk the MIME tree and return the best plain-text rendering of the body.
// Preference: text/plain at any depth → text/html stripped → empty string.
function extractBody(part: GmailPart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeB64Url(part.body.data).trim();
  }
  if (part.parts && part.parts.length > 0) {
    // First pass: prefer text/plain anywhere in the tree
    for (const child of part.parts) {
      if (child.mimeType === 'text/plain' && child.body?.data) {
        return decodeB64Url(child.body.data).trim();
      }
    }
    for (const child of part.parts) {
      const found = extractBody(child);
      if (found) return found;
    }
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    // Cheap HTML strip — good enough for an LLM to read as context.
    return decodeB64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function hasAnyAttachment(part: GmailPart | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.filename.trim()) return true;
  if (part.parts) return part.parts.some(hasAnyAttachment);
  return false;
}

function summaryFromRaw(raw: RawGmailMessage): GmailMessageSummary {
  const headers = raw.payload?.headers ?? [];
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  const labels = raw.labelIds ?? [];
  return {
    id: raw.id,
    threadId: raw.threadId,
    snippet: raw.snippet ?? '',
    from: get('From'),
    to: get('To'),
    subject: get('Subject') || '(no subject)',
    date: get('Date'),
    unread: labels.includes('UNREAD'),
    hasAttachment: hasAnyAttachment(raw.payload),
    labels,
  };
}

// Search Gmail using the same query syntax as the Gmail search box.
// Examples:
//   "from:lesmills.co.nz"
//   "subject:invoice newer_than:30d"
//   "is:unread label:work"
//   "has:attachment from:bank"
// Returns lightweight summaries (no body). Call readGmailMessage for the body.
export async function searchGmail(query: string, maxResults?: number): Promise<GmailMessageSummary[]> {
  const { accessToken } = await getValidAccessToken();
  const max = Math.max(1, Math.min(maxResults ?? 10, 25));

  // Step 1: list message IDs matching the query.
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(max));

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Gmail search failed: ${listRes.status} ${body}`);
  }
  const listJson = (await listRes.json()) as { messages?: { id: string; threadId: string }[] };
  const ids = (listJson.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return [];

  // Step 2: fetch metadata (headers only, no body) for each in parallel.
  const summaries = await Promise.all(
    ids.map(async (id): Promise<GmailMessageSummary> => {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
      url.searchParams.set('format', 'metadata');
      ['From', 'To', 'Subject', 'Date'].forEach((h) => url.searchParams.append('metadataHeaders', h));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        // One bad message shouldn't blow up the whole search.
        return {
          id, threadId: '', snippet: '', from: '', to: '',
          subject: '(fetch failed)', date: '', unread: false,
          hasAttachment: false, labels: [],
        };
      }
      return summaryFromRaw((await res.json()) as RawGmailMessage);
    })
  );
  return summaries;
}

// Read a single Gmail message in full — decoded body + headers + labels.
export async function readGmailMessage(messageId: string): Promise<GmailMessageFull> {
  const { accessToken } = await getValidAccessToken();
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set('format', 'full');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail message read failed: ${res.status} ${body}`);
  }
  const raw = (await res.json()) as RawGmailMessage;
  const summary = summaryFromRaw(raw);
  const headers = raw.payload?.headers ?? [];
  const get = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  return {
    ...summary,
    body: raw.payload ? extractBody(raw.payload) : '',
    cc:   get('Cc'),
    bcc:  get('Bcc'),
  };
}

export async function createEmailDraft(input: CreateDraftInput): Promise<DraftResult> {
  const { accessToken } = await getValidAccessToken();
  const raw = buildRawMessage(input);

  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gmail draft create failed: ${res.status} ${errBody}`);
  }
  const json = (await res.json()) as {
    id: string;
    message: { id: string; threadId: string };
  };

  return {
    draftId: json.id,
    messageId: json.message.id,
    threadId: json.message.threadId,
    // Gmail web URL pattern for opening a specific draft.
    htmlLink: `https://mail.google.com/mail/u/0/#drafts/${json.message.threadId}`,
  };
}
