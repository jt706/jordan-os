-- ════════════════════════════════════════════════════════════════════════════
-- 0004 — Add update + delete calendar action kinds
-- ════════════════════════════════════════════════════════════════════════════
-- Additive change: extends the action_kind enum without dropping the actions
-- table. Safe to run on a database with existing rows.
-- ════════════════════════════════════════════════════════════════════════════

alter type action_kind add value if not exists 'update_calendar_event';
alter type action_kind add value if not exists 'delete_calendar_event';
