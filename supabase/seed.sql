-- ════════════════════════════════════════════════════════════════════════════
-- JT OS — Seed Data
-- ════════════════════════════════════════════════════════════════════════════
-- Mirrors lib/mock-data.ts so the dashboard isn't empty after the schema
-- migration runs. Idempotent: drop everything first, then re-insert.
--
-- Run AFTER 0001_initial_schema.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- Wipe (CASCADE handles thread→message FK)
truncate table messages, threads, decisions, agents,
              subscriptions, achievements, ideas, execution_tasks
restart identity cascade;

-- ─── Threads + messages ─────────────────────────────────────────────────────
-- The bump_thread_on_message trigger would overwrite the seeded message_count
-- and last_message on each insert; disable it for the seed to preserve the
-- mock values, then re-enable.

alter table messages disable trigger messages_bump_thread;

do $seed$
declare
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  t3 uuid := gen_random_uuid();
  t4 uuid := gen_random_uuid();
  t5 uuid := gen_random_uuid();
  t6 uuid := gen_random_uuid();
begin
  insert into threads (id, title, last_message, message_count, tags, pinned, updated_at, created_at) values
    (t1, 'OpenClaw Go-To-Market Strategy',          'Approved the landing page redesign. Hermes to post brief.', 24, array['OpenClaw','Marketing'],     true,  '2025-05-03T08:04:30Z', '2025-04-15T09:00:00Z'),
    (t2, 'Q2 Cost Audit',                           'Trimmed $140/mo from underused subscriptions.',             11, array['Finance','Subscriptions'],  false, '2025-05-02T14:20:00Z', '2025-04-28T10:00:00Z'),
    (t3, 'New Idea: AI Invoice Generator SaaS',     'Opportunity score 74. Needs market sizing research.',        7, array['Ideas','SaaS'],             false, '2025-05-01T10:00:00Z', '2025-04-30T11:00:00Z'),
    (t4, 'Agent Restructure — Marketing Division',  'Benched Aria. Merged Copywriter into Growth Agent.',        18, array['Agents','Marketing'],       false, '2025-04-30T16:45:00Z', '2025-04-20T09:00:00Z'),
    (t5, 'Hermes Execution Layer Setup',            'Hermes approved for task queue. Pending first run.',        33, array['Execution','Hermes'],       false, '2025-04-28T09:30:00Z', '2025-04-10T10:00:00Z'),
    (t6, 'Ollama Local Model Evaluation',           'Llama 3 70B performs at 80% of GPT-4 for code tasks.',       9, array['Models','Research'],        false, '2025-04-25T11:00:00Z', '2025-04-22T14:00:00Z');

  insert into messages (thread_id, role, content, created_at) values
    (t1, 'assistant', 'Morning, Jordan. I''ve reviewed overnight activity across all divisions. Two decisions need your attention today — both flagged high confidence. The OpenClaw execution layer completed 3 tasks. No anomalies. Ready when you are.', '2025-05-03T08:01:00Z'),
    (t1, 'user',      'Give me the quick brief on the most urgent decision.', '2025-05-03T08:03:00Z'),
    (t1, 'assistant', '**Decision: Hire a freelance designer for the OpenClaw landing page.**' || E'\n\n' ||
                      'Risk: Low. Cost: $800 one-time. Confidence: 87%.' || E'\n\n' ||
                      'Rationale: Current landing page conversion rate is 1.2%. A professional redesign is estimated to lift this to 3–5%, directly impacting trial signups.' || E'\n\n' ||
                      'My recommendation: **Approve**. Want me to draft the job post and brief?',
                      '2025-05-03T08:03:15Z'),
    (t1, 'user',      'Approved. Yes, draft the brief and post it to Toptal.', '2025-05-03T08:04:00Z'),
    (t1, 'assistant', 'Logged. I''ve drafted the Toptal brief and it''s staged in the Execution Hub under Hermes for your final approval before posting. I can''t post autonomously — you''ll need to greenlight it there.' || E'\n\n' ||
                      'Next item: Your Claude Code subscription renews in 6 days. Value score is 9.1/10 — I recommend keeping it. Any questions on the briefing?',
                      '2025-05-03T08:04:30Z');
end
$seed$;

alter table messages enable trigger messages_bump_thread;

-- ─── Decisions ──────────────────────────────────────────────────────────────
insert into decisions (title, summary, risk, estimated_cost, confidence, recommendation, status, proposed_by, tags, created_at) values
  ('Hire freelance designer for OpenClaw landing page',
   'Current conversion rate is 1.2%. A professional redesign could lift this to 3–5%, increasing trial signups significantly.',
   'low', 800, 87,
   'Approve. Strong ROI case. Source via Toptal with clear brief and milestone-based payment.',
   'approved', 'CEO Agent', array['OpenClaw','Marketing','Design'], '2025-05-03T08:00:00Z'),

  ('Launch AI Invoice Generator as standalone SaaS',
   'Research indicates 50K+ searches/mo for invoice automation tools. Could be built in 6 weeks with Claude Code assistance.',
   'medium', 2400, 71,
   'Validate with a no-code MVP first (2-week sprint). Only invest full build if 10+ signups on waitlist.',
   'pending', 'Strategy Agent', array['SaaS','New Venture','AI'], '2025-05-02T12:00:00Z'),

  ('Upgrade to Claude Pro Team plan',
   'Current Claude Pro plan limits context window to 200K. Team plan adds collaborative features and priority access.',
   'low', 25, 82,
   'Park for 30 days. Current usage doesn''t justify upgrade yet. Revisit when team grows past 2.',
   'parked', 'CEO Agent', array['Subscriptions','Tools'], '2025-05-01T09:00:00Z'),

  ('Kill the SEO Blog Agent — low ROI',
   'SEO Blog Agent has produced 12 posts over 90 days. Organic traffic up 4%. Cost: $45/mo. Value-to-cost ratio is poor.',
   'low', 0, 76,
   'Kill the agent. Reallocate budget to paid ads experiment. Content can be done manually 1x/week.',
   'pending', 'Finance Agent', array['Agents','Cost Reduction'], '2025-04-30T14:00:00Z'),

  ('Integrate OpenClaw with Stripe for automated billing',
   'Manual invoicing is taking 3+ hours/week. Stripe integration would automate billing and reduce churn risk.',
   'medium', 400, 91,
   'Approve. High confidence, clear time savings, immediate revenue protection.',
   'pending', 'CEO Agent', array['OpenClaw','Revenue','Automation'], '2025-04-29T10:00:00Z');

-- ─── Agents ─────────────────────────────────────────────────────────────────
insert into agents (name, role, division, status, monthly_cost, value_created, roi, recommendation, capabilities, last_active, avatar) values
  ('CEO Agent',     'Chief Executive Agent — coordinates all divisions',           'Strategy',    'active',  0,  14200, 9999, 'Core system. Never bench.',                    array['Coordination','Decision Making','Planning','Synthesis'],     now(),                  '🧠'),
  ('Hermes',        'Execution Layer — task runner and automation orchestrator',   'Execution',   'active',  0,   3200, 9999, 'Core execution layer. Keep active.',           array['Task Execution','Web Browsing','API Calls','File Management'], '2025-05-03T07:00:00Z', '⚡'),
  ('Strategy Agent','Business strategy, competitive analysis, go-to-market',       'Strategy',    'active', 18,   4500, 2400, 'High value. Keep and expand capabilities.',    array['Market Research','GTM Strategy','Competitive Analysis'],      '2025-05-02T15:00:00Z', '♟️'),
  ('Finance Agent', 'Cost tracking, ROI analysis, budget recommendations',         'Finance',     'active', 12,   1800, 1400, 'Good value. Automate monthly reporting.',      array['Cost Analysis','ROI Tracking','Budget Forecasting'],          '2025-05-03T06:30:00Z', '📊'),
  ('Growth Agent',  'Marketing, copywriting, growth experiments',                  'Marketing',   'active', 24,   2100,  875, 'Moderate ROI. Focus on OpenClaw launch.',      array['Copywriting','Email Marketing','Growth Hacking','SEO'],       '2025-05-02T12:00:00Z', '📣'),
  ('Dev Agent',     'Code review, architecture planning, debugging',               'Development', 'idle',   30,   1200,  400, 'Underutilized. Activate for Claude Code integration.', array['Code Review','Architecture','Debugging','Documentation'], '2025-04-28T10:00:00Z', '💻'),
  ('Research Agent','Deep research, market sizing, trend analysis',                'Research',    'idle',   15,    900,  600, 'Activate for AI Invoice SaaS validation.',     array['Web Research','Data Synthesis','Report Writing'],             '2025-04-25T14:00:00Z', '🔬'),
  ('SEO Blog Agent','Blog writing, SEO content, keyword targeting',                'Marketing',   'benched',45,    240,  -47, 'Kill. Negative ROI. Content not converting.',  array['Blog Writing','SEO Optimization','Keyword Research'],         '2025-04-15T09:00:00Z', '📝');

-- ─── Subscriptions ──────────────────────────────────────────────────────────
insert into subscriptions (name, provider, monthly_cost, renewal_date, usage, value_score, recommendation, category, logo_emoji) values
  ('Claude Pro',      'Anthropic',     20,  '2025-05-09', 'high',   9.1, 'Keep. Essential for CEO Agent and daily workflows.',           'AI Model',           '🤖'),
  ('ChatGPT Plus',    'OpenAI',        20,  '2025-05-15', 'medium', 7.2, 'Keep for now. Review in 30 days if Claude covers use cases.',  'AI Model',           '💬'),
  ('Perplexity Pro',  'Perplexity AI', 20,  '2025-05-20', 'medium', 6.8, 'Review. Research Agent may replace this with free tier.',      'AI Research',        '🔍'),
  ('Claude Code',     'Anthropic',     100, '2025-05-09', 'high',   9.4, 'Keep. High value for Dev Agent and OpenClaw builds.',          'Dev Tools',          '⌨️'),
  ('Vercel Pro',      'Vercel',        20,  '2025-06-01', 'medium', 8.0, 'Keep. Core deployment infrastructure.',                        'Infrastructure',     '▲'),
  ('Notion',          'Notion',        16,  '2025-05-25', 'low',    4.2, 'Cancel. JT OS replaces most use cases.',                      'Productivity',       '📓'),
  ('Linear',          'Linear',        8,   '2025-05-18', 'medium', 7.5, 'Keep. Execution Hub integration planned.',                     'Project Management', '🎯'),
  ('Midjourney',      'Midjourney',    10,  '2025-05-12', 'low',    3.8, 'Cancel. Flux via Replicate API is cheaper and better.',        'AI Image',           '🎨');

-- ─── Achievements ───────────────────────────────────────────────────────────
insert into achievements (title, description, value_created, responsible_agent, category, achieved_at, verified) values
  ('OpenClaw Beta Launch',
   'Successfully launched OpenClaw to 47 beta users with zero downtime. First $1,200 MRR established.',
   1200, 'CEO Agent + Hermes', 'Revenue', '2025-04-20T00:00:00Z', true),

  ('Subscription Audit Saves $180/mo',
   'Finance Agent identified 4 redundant subscriptions. Cancelled Notion, Zapier, and downgraded GitHub.',
   2160, 'Finance Agent', 'Cost Saving', '2025-04-15T00:00:00Z', true),

  ('JT OS v0.1 Built in 1 Day',
   'Claude Code and Dev Agent collaborated to scaffold the full JT OS Mission Control in under 8 hours.',
   5000, 'Dev Agent + Claude Code', 'Innovation', '2025-05-03T00:00:00Z', false),

  ('GTM Strategy for OpenClaw',
   'Strategy Agent delivered a 12-page GTM plan. First 3 recommendations implemented. Trial signups +34%.',
   3400, 'Strategy Agent', 'Strategic', '2025-04-08T00:00:00Z', true),

  ('Local Ollama Setup — $0 Inference',
   'Research Agent benchmarked Llama 3 70B locally. Now handles 60% of non-critical tasks at zero API cost.',
   840, 'Research Agent', 'Efficiency', '2025-03-28T00:00:00Z', true),

  ('Hermes First Automated Run',
   'Hermes successfully executed 3 web-browsing tasks, filed 2 forms, and compiled a competitive analysis report.',
   400, 'Hermes', 'Efficiency', '2025-04-25T00:00:00Z', true);

-- ─── Ideas ──────────────────────────────────────────────────────────────────
insert into ideas (title, summary, opportunity_score, recommended_path, capital_required, next_action, stage, tags, created_at) values
  ('AI Invoice Generator SaaS',
   'Simple AI-powered invoicing tool for freelancers. 50K+ monthly searches, low competition in the sub-$20/mo tier.',
   74, 'No-code MVP on Softr. 2-week sprint. Validate with 10 signups.',
   200, 'Research Agent to size market and identify top 5 competitors',
   'validated', array['SaaS','AI','Freelance','Finance'], '2025-05-01T00:00:00Z'),

  ('JT OS — Public SaaS Version',
   'Package JT OS as a SaaS product for founders and solopreneurs. $49–$99/mo. High demand for AI OS tooling.',
   88, 'Build on current codebase. Target 100 beta waitlist before building.',
   0, 'Build waitlist landing page. Share in founder communities.',
   'raw', array['SaaS','AI OS','Founders','JT OS'], '2025-05-03T00:00:00Z'),

  ('OpenClaw Enterprise Tier',
   'Add team accounts and white-label to OpenClaw. 3 inbound requests from agencies already.',
   81, 'Interview 5 agency leads. Define scope. Build in Q3.',
   1500, 'Schedule 5 discovery calls via Growth Agent',
   'validated', array['OpenClaw','Enterprise','Revenue'], '2025-04-22T00:00:00Z'),

  ('Prompt Engineering Course',
   'Document JT OS workflows into a $197 course. Leverage existing audience.',
   62, 'Create 5 free YouTube videos first. Validate demand before building full course.',
   0, 'Record first 2 videos. Post to YouTube.',
   'raw', array['Education','Content','AI'], '2025-04-18T00:00:00Z'),

  ('AI Agent Marketplace for Niche Industries',
   'Curated marketplace of pre-built AI agents for specific verticals (legal, medical, real estate).',
   55, 'Too early. Monitor space for 90 days. Revisit in August.',
   5000, 'Park. Set reminder for August 2025.',
   'paused', array['Marketplace','AI Agents','Future'], '2025-04-01T00:00:00Z'),

  ('WhatsApp CEO Agent Interface',
   'Connect CEO Agent to WhatsApp for on-the-go decision making via mobile.',
   79, 'Twilio WhatsApp API + webhook to CEO Agent. 1-week build.',
   50, 'Dev Agent to prototype integration',
   'raw', array['Integration','Mobile','CEO Agent'], '2025-05-02T00:00:00Z');

-- ─── Execution tasks (seed Hermes pending approvals) ────────────────────────
insert into execution_tasks (task, tool, requested_by, status, risk_level, created_at) values
  ('Post designer job brief to Toptal',                              'Hermes',      'CEO Agent',      'awaiting-approval', 'low',    '2025-05-03T08:05:00Z'),
  ('Send follow-up email to 3 OpenClaw enterprise leads',            'Hermes',      'Growth Agent',   'awaiting-approval', 'low',    '2025-05-03T07:45:00Z'),
  ('Scrape competitor pricing pages (5 sites)',                      'OpenClaw',    'Strategy Agent', 'awaiting-approval', 'low',    '2025-05-02T20:00:00Z'),
  ('Refactor OpenClaw billing module + add Stripe webhooks',         'Claude Code', 'Dev Agent',      'awaiting-approval', 'medium', '2025-05-03T08:10:00Z');
