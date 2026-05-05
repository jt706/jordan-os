-- ════════════════════════════════════════════════════════════════════════════
-- Jordan OS — Bootstrap (combines 0001..0005 into one paste)
-- ════════════════════════════════════════════════════════════════════════════
-- For fresh Supabase projects. Open this file, select all, paste into the
-- Supabase SQL editor, run. One paste, no follow-ups.
--
-- Safe to re-run — every CREATE has a matching DROP at the top.
-- WARNING: re-running wipes all data. Use only on a project with no data,
-- or before applying seed.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── DROP EVERYTHING (clean slate) ──────────────────────────────────────────
drop table if exists actions          cascade;
drop table if exists integrations     cascade;
drop table if exists messages         cascade;
drop table if exists threads          cascade;
drop table if exists decisions        cascade;
drop table if exists agents           cascade;
drop table if exists execution_tasks  cascade;
drop table if exists achievements     cascade;
drop table if exists ideas            cascade;
drop table if exists subscriptions    cascade;

drop function if exists bump_thread_on_message() cascade;
drop function if exists set_updated_at()         cascade;

drop type if exists action_kind            cascade;
drop type if exists action_status          cascade;
drop type if exists integration_provider   cascade;
drop type if exists integration_status     cascade;
drop type if exists message_role           cascade;
drop type if exists decision_status        cascade;
drop type if exists risk_level             cascade;
drop type if exists usage_level            cascade;
drop type if exists agent_status           cascade;
drop type if exists agent_division         cascade;
drop type if exists idea_stage             cascade;
drop type if exists achievement_category   cascade;
drop type if exists execution_task_status  cascade;

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── ENUMS (all of them) ────────────────────────────────────────────────────
create type message_role          as enum ('user', 'assistant');
create type decision_status       as enum ('pending', 'approved', 'revised', 'parked', 'killed');
create type risk_level            as enum ('low', 'medium', 'high', 'critical');
create type usage_level           as enum ('low', 'medium', 'high');
create type agent_status          as enum ('active', 'idle', 'benched', 'killed');
create type agent_division        as enum ('Strategy', 'Research', 'Execution', 'Finance', 'Marketing', 'Operations', 'Development');
create type idea_stage            as enum ('raw', 'validated', 'in-progress', 'paused', 'shipped', 'killed');
create type achievement_category  as enum ('Revenue', 'Efficiency', 'Innovation', 'Cost Saving', 'Strategic', 'Community');
create type execution_task_status as enum ('queued', 'running', 'awaiting-approval', 'succeeded', 'failed', 'cancelled');

create type integration_provider as enum (
  'google_calendar', 'gmail', 'apple_reminders',
  'google_tasks', 'todoist', 'asana', 'linear'
);
create type integration_status as enum (
  'disconnected', 'connected', 'expired', 'error'
);

-- All action_kinds inlined (0003 + 0004 + 0005 combined).
create type action_kind as enum (
  'create_calendar_event',
  'update_calendar_event',
  'delete_calendar_event',
  'create_task',
  'update_task',
  'complete_task',
  'delete_task',
  'create_email_draft'
);

create type action_status as enum (
  'pending_approval', 'queued', 'running',
  'completed', 'failed', 'cancelled'
);

-- ─── HELPERS ────────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── threads ────────────────────────────────────────────────────────────────
create table threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  title         text not null,
  last_message  text default '',
  message_count integer not null default 0,
  tags          text[] not null default '{}',
  pinned        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index threads_user_id_idx     on threads (user_id);
create index threads_updated_at_idx  on threads (updated_at desc);
create trigger threads_set_updated_at
  before update on threads
  for each row execute function set_updated_at();

-- ─── messages ───────────────────────────────────────────────────────────────
create table messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  user_id     uuid,
  role        message_role not null,
  content     text not null,
  attachments text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index messages_thread_id_idx  on messages (thread_id, created_at);
create index messages_user_id_idx    on messages (user_id);

create or replace function bump_thread_on_message()
returns trigger language plpgsql as $$
begin
  update threads
     set message_count = message_count + 1,
         last_message  = left(new.content, 280),
         updated_at    = now()
   where id = new.thread_id;
  return new;
end;
$$;
create trigger messages_bump_thread
  after insert on messages
  for each row execute function bump_thread_on_message();

-- ─── decisions ──────────────────────────────────────────────────────────────
create table decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  title           text not null,
  summary         text not null default '',
  risk            risk_level not null default 'low',
  estimated_cost  numeric(12,2) not null default 0,
  confidence      smallint not null default 0 check (confidence between 0 and 100),
  recommendation  text not null default '',
  status          decision_status not null default 'pending',
  proposed_by     text not null default 'CEO Agent',
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index decisions_user_id_idx on decisions (user_id);
create index decisions_status_idx  on decisions (status);
create trigger decisions_set_updated_at
  before update on decisions
  for each row execute function set_updated_at();

-- ─── agents ─────────────────────────────────────────────────────────────────
create table agents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  name           text not null,
  role           text not null default '',
  division       agent_division not null,
  status         agent_status not null default 'active',
  monthly_cost   numeric(10,2) not null default 0,
  value_created  numeric(12,2) not null default 0,
  roi            numeric(10,2) not null default 0,
  recommendation text not null default '',
  capabilities   text[] not null default '{}',
  avatar         text not null default '🤖',
  last_active    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index agents_user_id_idx  on agents (user_id);
create index agents_status_idx   on agents (status);
create index agents_division_idx on agents (division);
create trigger agents_set_updated_at
  before update on agents
  for each row execute function set_updated_at();

-- ─── execution_tasks ────────────────────────────────────────────────────────
create table execution_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  task            text not null,
  tool            text not null default 'Hermes',
  requested_by    text not null default 'CEO Agent',
  status          execution_task_status not null default 'queued',
  risk_level      risk_level not null default 'low',
  result          jsonb,
  notes           text default '',
  approved_by     text,
  approved_at     timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index execution_tasks_user_id_idx    on execution_tasks (user_id);
create index execution_tasks_status_idx     on execution_tasks (status);
create index execution_tasks_created_at_idx on execution_tasks (created_at desc);
create trigger execution_tasks_set_updated_at
  before update on execution_tasks
  for each row execute function set_updated_at();

-- ─── achievements ───────────────────────────────────────────────────────────
create table achievements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
  title             text not null,
  description       text not null default '',
  value_created     numeric(12,2) not null default 0,
  responsible_agent text not null default '',
  category          achievement_category not null,
  achieved_at       timestamptz not null default now(),
  verified          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index achievements_user_id_idx     on achievements (user_id);
create index achievements_achieved_at_idx on achievements (achieved_at desc);
create trigger achievements_set_updated_at
  before update on achievements
  for each row execute function set_updated_at();

-- ─── ideas ──────────────────────────────────────────────────────────────────
create table ideas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,
  title              text not null,
  summary            text not null default '',
  opportunity_score  smallint not null default 0 check (opportunity_score between 0 and 100),
  recommended_path   text not null default '',
  capital_required   numeric(12,2) not null default 0,
  next_action        text not null default '',
  stage              idea_stage not null default 'raw',
  tags               text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ideas_user_id_idx on ideas (user_id);
create index ideas_stage_idx   on ideas (stage);
create trigger ideas_set_updated_at
  before update on ideas
  for each row execute function set_updated_at();

-- ─── subscriptions ──────────────────────────────────────────────────────────
create table subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  name           text not null,
  provider       text not null default '',
  monthly_cost   numeric(10,2) not null default 0,
  renewal_date   date,
  usage          usage_level not null default 'medium',
  value_score    numeric(3,1) not null default 0 check (value_score between 0 and 10),
  recommendation text not null default '',
  category       text not null default '',
  logo_emoji     text not null default '💳',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index subscriptions_user_id_idx      on subscriptions (user_id);
create index subscriptions_renewal_date_idx on subscriptions (renewal_date);
create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- ─── integrations ───────────────────────────────────────────────────────────
create table integrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  provider        integration_provider not null,
  status          integration_status not null default 'disconnected',
  refresh_token   text,
  access_token    text,
  expires_at      timestamptz,
  scopes          text,
  account_email   text,
  last_error      text,
  last_sync_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index integrations_provider_unique
  on integrations(coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), provider)
  where status <> 'disconnected';
create index integrations_status_idx on integrations(status);
create trigger integrations_set_updated_at
  before update on integrations
  for each row execute function set_updated_at();

-- ─── actions (Hermes audit log) ─────────────────────────────────────────────
create table actions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,
  kind               action_kind   not null,
  payload            jsonb         not null default '{}',
  status             action_status not null default 'queued',
  requires_approval  boolean       not null default false,
  thread_id          uuid references threads(id) on delete set null,
  proposed_by        text not null default 'ceo_agent',
  approved_at        timestamptz,
  approved_by        text,
  started_at         timestamptz,
  completed_at       timestamptz,
  result             jsonb,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index actions_status_idx     on actions(status);
create index actions_kind_idx       on actions(kind);
create index actions_thread_idx     on actions(thread_id);
create index actions_created_at_idx on actions(created_at desc);
create trigger actions_set_updated_at
  before update on actions
  for each row execute function set_updated_at();

-- ─── ROW LEVEL SECURITY (Stage 1: anon allowed, single-user) ────────────────
alter table threads         enable row level security;
alter table messages        enable row level security;
alter table decisions       enable row level security;
alter table agents          enable row level security;
alter table execution_tasks enable row level security;
alter table achievements    enable row level security;
alter table ideas           enable row level security;
alter table subscriptions   enable row level security;
alter table integrations    enable row level security;
alter table actions         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'threads','messages','decisions','agents',
    'execution_tasks','achievements','ideas','subscriptions',
    'integrations','actions'
  ] loop
    execute format('create policy "stage1_anon_all_%I" on %I for all to anon using (true) with check (true)', t, t);
    execute format('create policy "stage1_auth_all_%I" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end$$;

-- Done.
