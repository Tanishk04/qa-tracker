-- =========================================================
-- Migration 004 — developers, app_settings, priority_rank, archived
-- Safe to re-run.
-- =========================================================

-- Developers (team member → friendly name + Salesforce ID mapping)
create table if not exists developers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  sf_user_id  text,
  email       text,
  color       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_devs_user on developers(user_id);

alter table developers enable row level security;
drop policy if exists devs_owner on developers;
create policy devs_owner on developers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- App settings (per-user preferences, auto-created on first read)
create table if not exists app_settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  use_custom_priority  boolean not null default false,
  hide_uat_field       boolean not null default true,
  long_run_hours       int     not null default 3,
  idle_minutes         int     not null default 30,
  stuck_default_hours  int     not null default 48,
  stuck_quickhit_hours int     not null default 24,
  stuck_major_hours    int     not null default 72
);

alter table app_settings enable row level security;
drop policy if exists settings_owner on app_settings;
create policy settings_owner on app_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Priority rank (custom drag-to-sort order) + archived flag on user_stories
alter table user_stories
  add column if not exists priority_rank int,
  add column if not exists archived      boolean not null default false;

create index if not exists idx_us_archived on user_stories(user_id, archived);
create index if not exists idx_us_rank     on user_stories(user_id, priority_rank)
  where priority_rank is not null;
