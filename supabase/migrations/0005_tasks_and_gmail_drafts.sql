-- ════════════════════════════════════════════════════════════════════════════
-- 0005 — Add Google Tasks + Gmail draft action kinds
-- ════════════════════════════════════════════════════════════════════════════
-- Additive enum extension. Safe to run on a database with existing rows.
-- ════════════════════════════════════════════════════════════════════════════

alter type action_kind add value if not exists 'create_task';
alter type action_kind add value if not exists 'update_task';
alter type action_kind add value if not exists 'complete_task';
alter type action_kind add value if not exists 'delete_task';
alter type action_kind add value if not exists 'create_email_draft';
