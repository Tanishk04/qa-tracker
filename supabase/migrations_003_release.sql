-- =========================================================
-- Migration 003 — releases, priority pin, SF fields
-- Safe to re-run.
-- =========================================================

alter table user_stories
  add column if not exists release_label text,
  add column if not exists is_quick_hit  boolean not null default false,
  add column if not exists pinned        boolean not null default false,
  add column if not exists sf_status     text,
  add column if not exists sprint        text,
  add column if not exists acceptance_criteria text,
  add column if not exists solution_approach   text;

create index if not exists idx_us_release on user_stories(user_id, release_label);
create index if not exists idx_us_pinned  on user_stories(user_id, pinned) where pinned = true;
create index if not exists idx_us_qh      on user_stories(user_id, is_quick_hit);

-- Bulk-rename a release across all the user's stories
create or replace function rename_release(p_old text, p_new text)
returns int language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update user_stories set release_label = p_new
   where user_id = v_user and release_label is not distinct from p_old;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
