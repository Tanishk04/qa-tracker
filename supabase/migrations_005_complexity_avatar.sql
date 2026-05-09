-- =========================================================
-- Migration 005 — complexity (T-shirt sizing) + clay avatars
-- Safe to re-run.
-- =========================================================

alter table user_stories
  add column if not exists complexity text;

alter table developers
  add column if not exists avatar_seed text;

create index if not exists idx_us_complexity on user_stories(user_id, complexity);
