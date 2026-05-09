-- =========================================================
-- Migration 006 — Release Cycle (groups Major + Quick Hits per cadence)
-- Safe to re-run.
-- =========================================================

alter table user_stories
  add column if not exists release_cycle text;

create index if not exists idx_us_cycle on user_stories(user_id, release_cycle);
