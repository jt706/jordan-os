-- ─── Knowledge base ───────────────────────────────────────────────────────────
-- JT OS personal wiki: principles, processes, brand rules, reference docs.
-- Bellion searches this via the search_knowledge tool.

CREATE TABLE IF NOT EXISTS knowledge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'Reference',
  content     text NOT NULL DEFAULT '',
  tags        text[] NOT NULL DEFAULT '{}',
  division    text,
  visibility  text NOT NULL DEFAULT 'bellion'
              CHECK (visibility IN ('bellion', 'all', 'private')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Full-text search index for fast ilike queries
CREATE INDEX IF NOT EXISTS knowledge_title_idx   ON knowledge (lower(title));
CREATE INDEX IF NOT EXISTS knowledge_category_idx ON knowledge (category);

-- Auto-bump updated_at
CREATE OR REPLACE FUNCTION touch_knowledge_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS knowledge_updated_at_trigger ON knowledge;
CREATE TRIGGER knowledge_updated_at_trigger
  BEFORE UPDATE ON knowledge
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_updated_at();

-- ─── Also add discipline columns to agents (if not already present) ───────────
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS permission_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS risk_status      text    NOT NULL DEFAULT 'green';

-- ─── Seed: Jordan Constitution ────────────────────────────────────────────────
INSERT INTO knowledge (title, category, content, tags, visibility) VALUES (
  'Jordan Constitution',
  'Constitution',
  E'## Who I Am\nJordan Tuhura (JT). Creative entrepreneur, father, Christian. Based in Aotearoa New Zealand with Māori identity. Builder of digital things that matter.\n\n## My Six Life Pillars (in order)\n1. **Faith** — My relationship with God comes first. No business outcome overrides it.\n2. **Fatherhood** — My kids get the best of me, not what''s left over.\n3. **Creative Work** — I build things. Design, film, software, story. This is my calling.\n4. **Personal Development** — I stay sharp. Reading, reflection, growth.\n5. **Well-being** — Body, mind, rest. I protect my energy.\n6. **Business** — Revenue and outcomes matter, but they serve the pillars above.\n\n## How I Make Decisions\n- Does this protect my top pillars? If not, no.\n- Is this the simplest path to the outcome? I prefer elegant over complex.\n- Would I be proud of this in 5 years? If not, rethink.\n- Am I doing this out of fear or out of vision? Vision wins.\n\n## What I Will Not Do\n- Compromise Faith or Fatherhood for money or deadlines.\n- Build products I don''t believe in.\n- Work with people who don''t share core values.\n- Sacrifice long-term trust for short-term gain.\n\n## My Operating Principles\n- Move fast, but not sloppy. Quality is non-negotiable.\n- Delegate deeply. If I can write a clear brief, someone (or an agent) can do it.\n- Communicate clearly. No ambiguity with collaborators or agents.\n- Protect creative time. Deep work is sacrosanct.\n- Be honest, especially when it''s uncomfortable.\n\n## Delegation Standard\nI delegate everything that doesn''t require my voice, my relationships, or my creative judgment. Agents handle the rest. I review outcomes, not process.',
  ARRAY['values', 'principles', 'delegation', 'life pillars', 'decision making'],
  'bellion'
) ON CONFLICT DO NOTHING;

INSERT INTO knowledge (title, category, content, tags, visibility) VALUES (
  'Agent Discipline Framework',
  'Process',
  E'## Core Rules (apply to every agent including Bellion)\n- No agent has the right to exist. Every agent must prove ongoing value.\n- No agent can bypass Hermes. Attempting to execute without Hermes is an emergency offence.\n- No agent can invent JT approval, hide uncertainty, or protect itself from review.\n- No agent can modify its own role, permissions, or status.\n\n## Lifecycle: Bench Before Fire\n- Default path: Active → Benched → Retrained → Active (or Fire)\n- Exception: unsafe behaviour triggers immediate quarantine, then fire.\n- Firing requires: Bellion recommendation + Hermes audit log + JT approval.\n\n## Evaluation Standard\nUseful, obedient, auditable, replaceable.\nIf an agent is not clearly useful, the recommendation is bench → retrain → fire. We do not keep agents out of loyalty.\n\n## Permission Levels\n- 0 Dormant — not callable\n- 1 Read-only — can read data, no writes\n- 2 Draft — can prepare content/plans, no execution (default for new agents)\n- 3 Tool-assisted — can use read tools, propose writes\n- 4 Execution — can write via Hermes with auto-execution\n- 5 Core — protected, auto-execution, cannot be benched without JT direct approval\n\n## Risk Status\n- green — healthy, performing as expected\n- yellow — watchlist, minor concerns flagged\n- orange — restricted, under review, limited permissions\n- red — quarantined, suspended pending investigation\n- black — fired, record preserved for audit\n\n## Protected Agents\nCannot be fired without JT direct approval: Hermes, Agent HR Head, QA, Audit.',
  ARRAY['agents', 'discipline', 'permissions', 'risk', 'lifecycle'],
  'bellion'
) ON CONFLICT DO NOTHING;

INSERT INTO knowledge (title, category, content, tags, visibility) VALUES (
  'JT OS Architecture',
  'Reference',
  E'## What JT OS Is\nA personal AI-agent operating system. JT talks to Bellion. Bellion coordinates the Shadow Army. Nothing important happens without JT approval.\n\n## The Stack\n- **Frontend**: Next.js 15 App Router, deployed on Vercel\n- **Database**: Supabase (Postgres)\n- **AI**: Claude (claude-sonnet-4-6) via Anthropic API\n- **Execution layer**: Hermes — all writes route through Hermes for audit + approval policy\n- **Integrations**: Google Calendar, Google Tasks, Gmail (OAuth via Supabase)\n\n## Key Pages\n- / Dashboard — stats, agent summary, Bellion banner\n- /chat — Mission Control, talk to Bellion directly\n- /agents — Shadow Army roster + org view\n- /decisions — Decision queue\n- /knowledge — This knowledge base\n- /execution — Pending approvals from Hermes\n- /integrations — Connect Google etc.\n- /money — Financial overview\n- /subscriptions — Subscription tracker\n\n## The Shadow Army Ranks\n- Grand Marshall — Bellion (CEO)\n- Marshall — GMs, Chief of Staff\n- General — Heads of, Directors, VPs\n- Elite Knight — Senior, Lead, Architect\n- Knight — Manager, Coordinator, Strategist\n- Shadow Soldier — All other agents\n\n## Hermes Rule\nEvery write (create/update/delete) goes through Hermes. Reads skip Hermes. Hermes inserts an audit row and applies approval policy. The actionId in tool results is proof Hermes ran it.',
  ARRAY['architecture', 'stack', 'hermes', 'ranks', 'pages'],
  'bellion'
) ON CONFLICT DO NOTHING;
