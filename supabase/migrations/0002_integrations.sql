-- ════════════════════════════════════════════════════════════════════════════
-- 0002 — Integrations table
-- ════════════════════════════════════════════════════════════════════════════
-- Stores OAuth credentials (and stub rows) for every external service Hermes
-- talks to: Google Calendar, Gmail, Apple Reminders (placeholder), task systems,
-- etc. One row per provider. Single-user system for now — Stage 2 will add
-- auth.uid() scoping just like the other tables.
--
-- Tokens are stored as plaintext for now (single-user, localhost). Production
-- should encrypt at rest before this ever sees a real cloud deploy.
-- ════════════════════════════════════════════════════════════════════════════

-- Re-runnable: drop everything this migration owns first.
drop table if exists integrations cascade;
drop type  if exists integration_provider cascade;
drop type  if exists integration_status   cascade;

create type integration_provider as enum (
  'google_calendar',
  'gmail',
  'apple_reminders',
  'google_tasks',
  'todoist',
  'asana',
  'linear'
);

create type integration_status as enum (
  'disconnected',  -- no creds yet
  'connected',     -- creds present and last call worked
  'expired',       -- refresh token rejected; needs reconnect
  'error'          -- something else went wrong; see last_error
);

create table integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,                                 -- null until Stage 2 (auth)
  provider        integration_provider not null,

  status          integration_status not null default 'disconnected',

  -- OAuth credentials. refresh_token is the long-lived secret.
  -- access_token is short-lived; we refresh before expires_at.
  refresh_token   text,
  access_token    text,
  expires_at      timestamptz,

  -- Granted OAuth scopes, comma-separated, exactly as Google returned them.
  scopes          text,

  -- Provider-side identity (e.g. the Gmail address Jordan logged in as).
  account_email   text,

  -- Diagnostics
  last_error      text,
  last_sync_at    timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One active integration per provider (per user). 'disconnected' rows are
-- excluded so we can keep historical "you used to be connected" records
-- without blocking a fresh connect. In practice we'll just upsert.
create unique index integrations_provider_unique
  on integrations(coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider)
  where status <> 'disconnected';

create index integrations_status_idx on integrations(status);

create trigger integrations_set_updated_at
  before update on integrations
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security — Stage 1 (matches every other table)
-- ────────────────────────────────────────────────────────────────────────────
alter table integrations enable row level security;

create policy "stage1_anon_all_integrations"
  on integrations for all to anon
  using (true) with check (true);

create policy "stage1_auth_all_integrations"
  on integrations for all to authenticated
  using (true) with check (true);
