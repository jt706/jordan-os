-- ════════════════════════════════════════════════════════════════════════════
-- 0006 — HR Unit (hire / train / fire / bench / activate AI agents)
-- ════════════════════════════════════════════════════════════════════════════
-- Adds the missing pieces so the agents table is a real HR record:
--   • system_prompt   — the agent's actual instructions (what makes them them)
--   • hire_reason     — why this agent was created
--   • fire_reason     — why this agent was killed (audit trail)
--   • fired_at        — when they were killed
--   • hired_at        — convenience copy of created_at, kept on update of the row
--
-- Creates training_events: every time Jordan trains an agent (refines its
-- prompt, adds a capability, gives it feedback), a row lands here. The
-- system_prompt history is implicit in those rows.
--
-- Extends action_kind so Hermes can audit hire/train/fire just like it does
-- calendar / tasks / drafts. CEO Agent calls proposeAction({ kind: 'hire_agent', ... })
-- and Hermes runs the lib/agents/hr.ts handler.
--
-- Idempotent. Safe to run on a populated DB.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Extend agents table ──────────────────────────────────────────────────────
alter table agents add column if not exists system_prompt text not null default '';
alter table agents add column if not exists hire_reason   text not null default '';
alter table agents add column if not exists fire_reason   text;
alter table agents add column if not exists fired_at      timestamptz;
alter table agents add column if not exists hired_at      timestamptz not null default now();

-- ─── training_events ──────────────────────────────────────────────────────────
-- One row per training pass. `kind` distinguishes prompt-rewrite vs. capability-add
-- vs. feedback-only. `before` / `after` snapshot what changed for the prompt-rewrite
-- case so Jordan can see the diff.
create table if not exists training_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid,
  agent_id        uuid not null references agents(id) on delete cascade,

  kind            text not null,              -- 'prompt_rewrite' | 'capability_add' | 'capability_remove' | 'feedback'
  feedback        text not null default '',   -- Jordan's reason / instruction
  before_prompt   text,                       -- snapshot pre-change (for prompt_rewrite)
  after_prompt    text,                       -- snapshot post-change

  capability      text,                       -- the capability added / removed (for capability_*)

  trained_by      text not null default 'jordan',
  created_at      timestamptz not null default now()
);

create index if not exists training_events_agent_idx
  on training_events(agent_id, created_at desc);

alter table training_events enable row level security;

drop policy if exists "stage1_anon_all_training_events" on training_events;
drop policy if exists "stage1_auth_all_training_events" on training_events;

create policy "stage1_anon_all_training_events"
  on training_events for all to anon
  using (true) with check (true);

create policy "stage1_auth_all_training_events"
  on training_events for all to authenticated
  using (true) with check (true);

-- ─── Extend action_kind enum ──────────────────────────────────────────────────
alter type action_kind add value if not exists 'hire_agent';
alter type action_kind add value if not exists 'train_agent';
alter type action_kind add value if not exists 'fire_agent';
alter type action_kind add value if not exists 'bench_agent';
alter type action_kind add value if not exists 'activate_agent';
