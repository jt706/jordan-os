-- ════════════════════════════════════════════════════════════════════════════
-- 0007 — Agent Runtime + Value Attribution
-- ════════════════════════════════════════════════════════════════════════════
-- Three small additions that turn the HR roster from a directory into a
-- runnable team:
--
--   1. threads.agent_id — when set, /api/chat swaps the CEO system prompt
--      for that agent's system_prompt. Lets you have a per-agent thread
--      ("Talk to Marketing Director") instead of one global CEO chat.
--
--   2. value_log — tiny attribution table. Every time an agent produces
--      something measurable (a hire close, a saved subscription, a
--      campaign win), Jordan logs an entry. Sums roll up to
--      agents.value_created so the ROI chip on each card stays honest.
--
-- Idempotent. Safe to run on a populated DB.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── threads.agent_id ────────────────────────────────────────────────────────
alter table threads
  add column if not exists agent_id uuid references agents(id) on delete set null;

create index if not exists threads_agent_id_idx on threads(agent_id);

-- ─── value_log ───────────────────────────────────────────────────────────────
create table if not exists value_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  agent_id    uuid not null references agents(id) on delete cascade,
  amount      numeric(12, 2) not null,           -- can be negative for cost write-offs
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists value_log_agent_idx
  on value_log(agent_id, created_at desc);

alter table value_log enable row level security;

drop policy if exists "stage1_anon_all_value_log" on value_log;
drop policy if exists "stage1_auth_all_value_log" on value_log;

create policy "stage1_anon_all_value_log"
  on value_log for all to anon
  using (true) with check (true);

create policy "stage1_auth_all_value_log"
  on value_log for all to authenticated
  using (true) with check (true);
