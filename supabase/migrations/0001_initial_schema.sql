-- ════════════════════════════════════════════════════════════════════════════
-- Jordan OS — Initial Schema (JT OS)
-- ════════════════════════════════════════════════════════════════════════════
-- Mirrors lib/types.ts. Single-user app today, designed to migrate cleanly
-- to multi-user / shared-org later via the user_id column on every row.
--
-- RLS posture (Stage 1, single-user, no auth UI yet):
--   • RLS is ENABLED on every table.
--   • Policies allow the `anon` role (publishable key from the browser) full
--     CRUD. This is intentional for a personal localhost dashboard. When you
--     add Supabase Auth, replace the anon policies with auth.uid()-bound ones
--     in migration 0002. See the "STAGE 2" block at the bottom of this file
--     for ready-to-use locked-down policies.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Clean slate (safe to re-run) ────────────────────────────────────────────
-- Drops everything this migration creates so you can paste-and-run the file
-- as many times as you like during setup. Wipes data — fine while there is
-- none, intentional once the app is live (use the seed file to repopulate).
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

drop type if exists message_role           cascade;
drop type if exists decision_status        cascade;
drop type if exists risk_level             cascade;
drop type if exists usage_level            cascade;
drop type if exists agent_status           cascade;
drop type if exists agent_division         cascade;
drop type if exists idea_stage             cascade;
drop type if exists achievement_category   cascade;
drop type if exists execution_task_status  cascade;

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ─── Enums (mirror lib/types.ts) ─────────────────────────────────────────────
create type message_role          as enum ('user', 'assistant');
create type decision_status       as enum ('pending', 'approved', 'revised', 'parked', 'killed');
create type risk_level            as enum ('low', 'medium', 'high', 'critical');
create type usage_level           as enum ('low', 'medium', 'high');
create type agent_status          as enum ('active', 'idle', 'benched', 'killed');
create type agent_division        as enum ('Strategy', 'Research', 'Execution', 'Finance', 'Marketing', 'Operations', 'Development');
create type idea_stage            as enum ('raw', 'validated', 'in-progress', 'paused', 'shipped', 'killed');
create type achievement_category  as enum ('Revenue', 'Efficiency', 'Innovation', 'Cost Saving', 'Strategic', 'Community');
create type execution_task_status as enum ('queued', 'running', 'awaiting-approval', 'succeeded', 'failed', 'cancelled');

-- ─── updated_at trigger helper ───────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- threads
-- ────────────────────────────────────────────────────────────────────────────
create table threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,                          -- nullable until auth lands
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

-- ────────────────────────────────────────────────────────────────────────────
-- messages
-- ────────────────────────────────────────────────────────────────────────────
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

-- Keep threads.message_count and threads.last_message in sync automatically
create or replace function bump_thread_on_message()
returns trigger
language plpgsql
as $$
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

-- ────────────────────────────────────────────────────────────────────────────
-- decisions
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- agents
-- ────────────────────────────────────────────────────────────────────────────
create table agents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid,
  name           text not null,
  role           text not null default '',
  division       agent_division not null,
  status         agent_status not null default 'active',
  monthly_cost   numeric(10,2) not null default 0,
  value_created  numeric(12,2) not null default 0,
  roi            numeric(10,2) not null default 0,   -- percentage
  recommendation text not null default '',
  capabilities   text[] not null default '{}',
  avatar         text not null default '🤖',         -- emoji
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

-- ────────────────────────────────────────────────────────────────────────────
-- execution_tasks
-- Hermes writes here. Distinct from the ExecutionTool registry in code —
-- this is the *log* of work Hermes (and other tools) attempts and runs.
-- ────────────────────────────────────────────────────────────────────────────
create table execution_tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  task            text not null,                       -- what to do
  tool            text not null default 'Hermes',      -- which executor (Hermes / OpenClaw / Claude Code / Ollama)
  requested_by    text not null default 'CEO Agent',   -- which agent queued it
  status          execution_task_status not null default 'queued',
  risk_level      risk_level not null default 'low',
  result          jsonb,                               -- structured output / error payload
  notes           text default '',
  approved_by     text,                                -- 'Jordan' once approved
  approved_at     timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index execution_tasks_user_id_idx   on execution_tasks (user_id);
create index execution_tasks_status_idx    on execution_tasks (status);
create index execution_tasks_created_at_idx on execution_tasks (created_at desc);
create trigger execution_tasks_set_updated_at
  before update on execution_tasks
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- achievements
-- ────────────────────────────────────────────────────────────────────────────
create table achievements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
  title             text not null,
  description       text not null default '',
  value_created     numeric(12,2) not null default 0,
  responsible_agent text not null default '',
  category          achievement_category not null,
  achieved_at       timestamptz not null default now(),  -- maps to TS `date`
  verified          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index achievements_user_id_idx     on achievements (user_id);
create index achievements_achieved_at_idx on achievements (achieved_at desc);
create trigger achievements_set_updated_at
  before update on achievements
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- ideas
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- subscriptions
-- ────────────────────────────────────────────────────────────────────────────
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

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security — Stage 1 (single-user, no auth yet)
-- ════════════════════════════════════════════════════════════════════════════
-- Every table has RLS enabled. The policies below allow `anon` (the
-- publishable key used in the browser) full CRUD. This is intentional for
-- localhost; tighten in Stage 2 once auth is wired.
-- ════════════════════════════════════════════════════════════════════════════

alter table threads         enable row level security;
alter table messages        enable row level security;
alter table decisions       enable row level security;
alter table agents          enable row level security;
alter table execution_tasks enable row level security;
alter table achievements    enable row level security;
alter table ideas           enable row level security;
alter table subscriptions   enable row level security;

-- Helper: one policy per table, all roles, all ops. Use a DO block to keep
-- this concise and easy to drop in Stage 2.
do $$
declare
  t text;
begin
  foreach t in array array[
    'threads','messages','decisions','agents',
    'execution_tasks','achievements','ideas','subscriptions'
  ] loop
    execute format('create policy "stage1_anon_all_%I" on %I for all to anon using (true) with check (true)', t, t);
    execute format('create policy "stage1_auth_all_%I" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end$$;

-- ════════════════════════════════════════════════════════════════════════════
-- STAGE 2 — when auth is wired, run this to lock everything to the user
-- ════════════════════════════════════════════════════════════════════════════
-- (Left here as a comment block; copy into 0002_lock_rls.sql when ready.)
-- ────────────────────────────────────────────────────────────────────────────
--   do $$
--   declare t text;
--   begin
--     foreach t in array array[
--       'threads','messages','decisions','agents',
--       'execution_tasks','achievements','ideas','subscriptions'
--     ] loop
--       execute format('drop policy if exists "stage1_anon_all_%I" on %I', t, t);
--       execute format('drop policy if exists "stage1_auth_all_%I" on %I', t, t);
--       execute format('alter table %I alter column user_id set default auth.uid()', t);
--       execute format('alter table %I alter column user_id set not null', t);
--       execute format('create policy "owner_select_%I" on %I for select to authenticated using (auth.uid() = user_id)', t, t);
--       execute format('create policy "owner_modify_%I" on %I for all    to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
--     end loop;
--   end$$;
-- ════════════════════════════════════════════════════════════════════════════
