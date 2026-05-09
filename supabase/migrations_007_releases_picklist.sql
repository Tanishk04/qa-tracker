-- =========================================================
-- Migration 007 — Releases picklist + Major/QH1/QH2 track
-- - New `releases` table (per-user picklist of release names)
-- - New `release_track` column on user_stories ('major'|'qh1'|'qh2'|null)
-- - Backfill release_track from existing is_quick_hit boolean
-- - Seed releases table from existing release_label values
-- - Sprint and release_cycle columns are kept (read-only) for safety;
--   the UI no longer surfaces them.
-- Safe to re-run.
-- =========================================================

-- Releases picklist
create table if not exists releases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists uniq_release_name on releases(user_id, name);
create index if not exists idx_releases_user on releases(user_id);

alter table releases enable row level security;
drop policy if exists releases_owner on releases;
create policy releases_owner on releases for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- New track column on user_stories: which sub-track of the release this is
alter table user_stories
  add column if not exists release_track text;

-- Constrain to known values when present
do $$ begin
  alter table user_stories
    add constraint user_stories_release_track_chk
      check (release_track is null or release_track in ('major','qh1','qh2'));
exception when duplicate_object then null; end $$;

create index if not exists idx_us_track on user_stories(user_id, release_track);

-- Backfill: existing is_quick_hit=true → qh1 (best-effort, user can edit)
-- existing release_label set + is_quick_hit=false → major
update user_stories set release_track = 'qh1'
  where release_track is null and is_quick_hit = true;
update user_stories set release_track = 'major'
  where release_track is null and is_quick_hit = false and release_label is not null;

-- Seed releases table from any release_label values that exist on user_stories
insert into releases(user_id, name)
  select distinct user_id, release_label from user_stories
  where release_label is not null
on conflict do nothing;

-- Rename a release across the releases table + all user_stories. Atomic.
create or replace function rename_release_v2(p_old text, p_new text)
returns int language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_new is null or btrim(p_new) = '' then raise exception 'new name required'; end if;

  -- Update or create the releases row
  insert into releases(user_id, name) values (v_user, p_new)
  on conflict do nothing;
  delete from releases where user_id = v_user and name is not distinct from p_old and p_old <> p_new;

  -- Cascade rename onto user_stories
  update user_stories set release_label = p_new
   where user_id = v_user and release_label is not distinct from p_old;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Delete a release (and clear it from any stories that reference it)
create or replace function delete_release(p_name text)
returns int language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update user_stories set release_label = null
   where user_id = v_user and release_label = p_name;
  get diagnostics v_count = row_count;
  delete from releases where user_id = v_user and name = p_name;
  return v_count;
end $$;
