-- ════════════════════════════════════════════════════════════════════════════
-- 0003 — Hermes actions
-- ════════════════════════════════════════════════════════════════════════════
-- The execution layer's audit log + queue. Every side-effecting thing any
-- agent does (create event, send email, run task) becomes a row here. The
-- CEO Agent doesn't call Google directly anymore — it calls Hermes, which
-- inserts a row, applies policy (auto-execute vs. require approval), runs
-- the handler, and writes the result back.
--
-- Why this exists:
--   1. Auditability — every action ever taken, with timestamps and result
--   2. Approval gates — material actions queue until Jordan says yes
--   3. Future async — once the queue is real, we can defer execution
-- ════════════════════════════════════════════════════════════════════════════

drop table if exists actions cascade;
drop type  if exists action_kind   cascade;
drop type  if exists action_status cascade;

-- The set of action kinds Hermes knows how to execute. Add a value here ONLY
-- when there's a matching handler in lib/hermes/handlers.ts. The migration
-- intentionally enforces the contract.
create type action_kind as enum (
  'create_calendar_event'
);

create type action_status as enum (
  'pending_approval',  -- waiting on Jordan to approve before we run it
  'queued',            -- approved (or auto-approved by policy), waiting to run
  'running',           -- handler is executing right now
  'completed',         -- handler returned successfully — see result jsonb
  'failed',            -- handler threw — see error text
  'cancelled'          -- Jordan rejected, or cancelled before execution
);

create table actions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,                                 -- null until Stage 2 (auth)

  kind               action_kind   not null,
  payload            jsonb         not null default '{}',  -- args for the handler
  status             action_status not null default 'queued',
  requires_approval  boolean       not null default false, -- snapshot of policy at propose-time

  -- Where the action came from
  thread_id          uuid references threads(id) on delete set null,
  proposed_by        text not null default 'ceo_agent',     -- 'ceo_agent' | 'jordan' | future agent names

  -- Approval lifecycle
  approved_at        timestamptz,
  approved_by        text,

  -- Execution lifecycle
  started_at         timestamptz,
  completed_at       timestamptz,

  -- Outcome
  result             jsonb,                                 -- handler return value
  error              text,                                  -- handler exception message

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index actions_status_idx       on actions(status);
create index actions_kind_idx         on actions(kind);
create index actions_thread_idx       on actions(thread_id);
create index actions_created_at_idx   on actions(created_at desc);

create trigger actions_set_updated_at
  before update on actions
  for each row execute function set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Row Level Security — Stage 1 (matches every other table)
-- ────────────────────────────────────────────────────────────────────────────
alter table actions enable row level security;

create policy "stage1_anon_all_actions"
  on actions for all to anon
  using (true) with check (true);

create policy "stage1_auth_all_actions"
  on actions for all to authenticated
  using (true) with check (true);
