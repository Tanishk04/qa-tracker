-- =========================================================
-- QA Tracker — Combined schema (fresh install)
-- Run this single file in the Supabase SQL Editor to set up
-- a brand-new project. Safe to re-run (fully idempotent).
--
-- For existing projects that ran schema.sql + individual
-- migrations: continue running new migrations_NNN_*.sql
-- files only — do NOT re-run this file over an existing DB.
-- =========================================================

create extension if not exists "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────

do $$ begin
  create type task_type as enum (
    'understand', 'tc_write', 'tc_review', 'sit_test', 'uat_test'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum (
    'not_started', 'in_progress', 'paused', 'done', 'skipped'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type log_action as enum (
    'STARTED', 'PAUSED', 'COMPLETED', 'REOPENED', 'SKIPPED'
  );
exception when duplicate_object then null; end $$;

-- ─── TABLES ─────────────────────────────────────────────────

create table if not exists user_stories (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  us_id                text        not null,
  title                text        not null,
  description          text,
  priority             text,
  developer            text,
  deployed_to_uat      boolean     not null default false,
  defect_status        text,
  notes                text,
  stage                text        not null default 'not_started',
  auto_stage           boolean     not null default true,

  -- Release grouping
  release_label        text,
  release_track        text,       -- 'major' | 'qh1' | 'qh2' | null
  is_quick_hit         boolean     not null default false,  -- legacy, kept for compatibility
  release_cycle        text,       -- legacy, kept for compatibility

  -- UI state
  pinned               boolean     not null default false,
  priority_rank        int,
  archived             boolean     not null default false,
  complexity           text,       -- 'XS' | 'S' | 'M' | 'L' | 'XL' | null

  -- Salesforce read-only fields
  sf_status            text,
  sprint               text,       -- legacy
  acceptance_criteria  text,
  solution_approach    text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (user_id, us_id),
  constraint user_stories_release_track_chk
    check (release_track is null or release_track in ('major', 'qh1', 'qh2'))
);

create table if not exists tasks (
  id                    uuid         primary key default gen_random_uuid(),
  user_id               uuid         not null references auth.users(id) on delete cascade,
  us_pk                 uuid         not null references user_stories(id) on delete cascade,
  type                  task_type    not null,
  status                task_status  not null default 'not_started',
  order_index           int          not null,
  started_at            timestamptz,
  completed_at          timestamptz,
  manual_adjust_seconds int          not null default 0,
  evidence_required     boolean      not null default false,
  evidence_uploaded     boolean      not null default false,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now(),
  unique (us_pk, type)
);

create table if not exists activity_logs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  us_pk       uuid        not null references user_stories(id) on delete cascade,
  task_id     uuid        not null references tasks(id) on delete cascade,
  action      log_action  not null,
  from_status task_status,
  to_status   task_status,
  ts          timestamptz not null default now()
);

create table if not exists developers (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  sf_user_id  text,
  email       text,
  color       text,
  avatar_seed text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists releases (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists app_settings (
  user_id              uuid    primary key references auth.users(id) on delete cascade,
  use_custom_priority  boolean not null default false,
  hide_uat_field       boolean not null default true,
  long_run_hours       int     not null default 3,
  idle_minutes         int     not null default 30,
  stuck_default_hours  int     not null default 48,
  stuck_quickhit_hours int     not null default 24,
  stuck_major_hours    int     not null default 72
);

-- ─── INDEXES ────────────────────────────────────────────────

create index if not exists idx_us_user       on user_stories(user_id);
create index if not exists idx_us_stage      on user_stories(user_id, stage);
create index if not exists idx_us_release    on user_stories(user_id, release_label);
create index if not exists idx_us_track      on user_stories(user_id, release_track);
create index if not exists idx_us_pinned     on user_stories(user_id, pinned) where pinned = true;
create index if not exists idx_us_archived   on user_stories(user_id, archived);
create index if not exists idx_us_rank       on user_stories(user_id, priority_rank) where priority_rank is not null;
create index if not exists idx_us_complexity on user_stories(user_id, complexity);
create index if not exists idx_us_qh         on user_stories(user_id, is_quick_hit);

create index if not exists idx_tasks_user    on tasks(user_id);
create index if not exists idx_tasks_us      on tasks(us_pk);
create index if not exists idx_tasks_status  on tasks(user_id, status);

-- Only one in_progress task per user at a time (enforced at the DB level)
create unique index if not exists uniq_one_in_progress
  on tasks(user_id) where status = 'in_progress';

create index if not exists idx_logs_task_ts  on activity_logs(task_id, ts);
create index if not exists idx_logs_user_ts  on activity_logs(user_id, ts);

create index if not exists idx_devs_user     on developers(user_id);
create index if not exists idx_releases_user on releases(user_id);
create unique index if not exists uniq_release_name on releases(user_id, name);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────

alter table user_stories  enable row level security;
alter table tasks         enable row level security;
alter table activity_logs enable row level security;
alter table developers    enable row level security;
alter table releases      enable row level security;
alter table app_settings  enable row level security;

drop policy if exists us_owner       on user_stories;
drop policy if exists tasks_owner    on tasks;
drop policy if exists logs_owner     on activity_logs;
drop policy if exists devs_owner     on developers;
drop policy if exists releases_owner on releases;
drop policy if exists settings_owner on app_settings;

create policy us_owner       on user_stories  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_owner    on tasks         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy logs_owner     on activity_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy devs_owner     on developers    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy releases_owner on releases      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy settings_owner on app_settings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── FUNCTIONS & TRIGGERS ───────────────────────────────────

-- Auto-update updated_at on any row change
create or replace function _touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_us_touch    on user_stories;
drop trigger if exists trg_tasks_touch on tasks;

create trigger trg_us_touch    before update on user_stories for each row execute function _touch_updated_at();
create trigger trg_tasks_touch before update on tasks        for each row execute function _touch_updated_at();

-- Auto-create 5 tasks whenever a user story is inserted
create or replace function create_default_tasks()
returns trigger language plpgsql as $$
begin
  insert into tasks(user_id, us_pk, type, order_index, evidence_required) values
    (new.user_id, new.id, 'understand'::task_type, 1, false),
    (new.user_id, new.id, 'tc_write'::task_type,   2, false),
    (new.user_id, new.id, 'tc_review'::task_type,  3, false),
    (new.user_id, new.id, 'sit_test'::task_type,   4, false),
    (new.user_id, new.id, 'uat_test'::task_type,   5, true)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_us_create_tasks on user_stories;
create trigger trg_us_create_tasks
  after insert on user_stories
  for each row execute function create_default_tasks();

-- Compute the stage a story should be in based on its task states
create or replace function compute_stage(p_us uuid)
returns text language plpgsql as $$
declare
  v_uat_done        boolean;
  v_uat_active      boolean;
  v_uat_evidence_ok boolean;
  v_sit_done        boolean;
  v_sit_active      boolean;
  v_any_active      boolean;
  v_any_started     boolean;
begin
  select (status = 'done'), (status = 'in_progress'),
         (status = 'done' and (not evidence_required or evidence_uploaded))
    into v_uat_done, v_uat_active, v_uat_evidence_ok
  from tasks where us_pk = p_us and type = 'uat_test';

  select (status in ('done', 'skipped')) into v_sit_done   from tasks where us_pk = p_us and type = 'sit_test';
  select (status = 'in_progress')        into v_sit_active from tasks where us_pk = p_us and type = 'sit_test';

  select bool_or(status = 'in_progress'),
         bool_or(status in ('in_progress', 'paused', 'done', 'skipped'))
    into v_any_active, v_any_started
  from tasks where us_pk = p_us;

  if v_uat_done and v_uat_evidence_ok then return 'completed';   end if;
  if v_uat_active or v_sit_done        then return 'uat';        end if;
  if v_sit_active                      then return 'sit';        end if;
  if v_any_active or v_any_started     then return 'in_progress'; end if;
  return 'not_started';
end $$;

-- Keep user_stories.stage in sync after any task change (only when auto_stage = true)
create or replace function _sync_stage()
returns trigger language plpgsql as $$
declare
  v_us   uuid := coalesce(new.us_pk, old.us_pk);
  v_auto boolean;
  v_new  text;
begin
  select auto_stage into v_auto from user_stories where id = v_us;
  if v_auto is null or v_auto = false then return null; end if;
  v_new := compute_stage(v_us);
  update user_stories set stage = v_new where id = v_us and stage is distinct from v_new;
  return null;
end $$;

drop trigger if exists trg_tasks_sync_stage on tasks;
create trigger trg_tasks_sync_stage
  after insert or update or delete on tasks
  for each row execute function _sync_stage();

-- ─── ATOMIC TASK RPCs ────────────────────────────────────────

-- Start a task; atomically pauses any currently running task
create or replace function start_task(p_task uuid)
returns void language plpgsql security definer as $$
declare
  v_user    uuid := auth.uid();
  v_current uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select id into v_current from tasks
    where user_id = v_user and status = 'in_progress' and id <> p_task
    limit 1;

  if v_current is not null then
    update tasks set status = 'paused' where id = v_current and user_id = v_user;
    insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
      select user_id, us_pk, id, 'PAUSED', 'in_progress', 'paused' from tasks where id = v_current;
  end if;

  update tasks
     set status = 'in_progress',
         started_at = coalesce(started_at, now())
   where id = p_task and user_id = v_user;

  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'STARTED', null, 'in_progress' from tasks where id = p_task;
end $$;

-- Pause whichever task is currently in progress
create or replace function pause_current()
returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'paused'
    where user_id = v_user and status = 'in_progress';
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'PAUSED', 'in_progress', 'paused'
      from tasks
     where user_id = v_user and status = 'paused'
       and updated_at >= now() - interval '2 seconds';
end $$;

-- Complete a task; enforces evidence_required for UAT
create or replace function complete_task(p_task uuid)
returns void language plpgsql security definer as $$
declare
  v_user uuid := auth.uid();
  v_prev task_status;
  v_req  boolean;
  v_evi  boolean;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select status, evidence_required, evidence_uploaded
    into v_prev, v_req, v_evi
  from tasks where id = p_task and user_id = v_user;

  if v_req and not v_evi then
    raise exception 'evidence_required';
  end if;

  update tasks set status = 'done', completed_at = now()
   where id = p_task and user_id = v_user;

  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'COMPLETED', v_prev, 'done' from tasks where id = p_task;
end $$;

-- Reopen a completed task back to not_started
create or replace function reopen_task(p_task uuid)
returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'not_started', completed_at = null
    where id = p_task and user_id = v_user;
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'REOPENED', 'done', 'not_started' from tasks where id = p_task;
end $$;

-- Skip a task (no time tracking, does not block stage progression)
create or replace function skip_task(p_task uuid)
returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'skipped' where id = p_task and user_id = v_user;
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'SKIPPED', null, 'skipped' from tasks where id = p_task;
end $$;

-- Toggle evidence_uploaded on a task
create or replace function set_evidence(p_task uuid, p_value boolean)
returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set evidence_uploaded = p_value where id = p_task and user_id = v_user;
end $$;

-- ─── RELEASE RPCs ────────────────────────────────────────────

-- Rename a release; cascades to user_stories and the releases picklist
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

create or replace function rename_release_v2(p_old text, p_new text)
returns int language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_count int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_new is null or btrim(p_new) = '' then raise exception 'new name required'; end if;

  insert into releases(user_id, name) values (v_user, p_new) on conflict do nothing;
  delete from releases where user_id = v_user and name is not distinct from p_old and p_old <> p_new;

  update user_stories set release_label = p_new
   where user_id = v_user and release_label is not distinct from p_old;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Delete a release; clears the label from any stories that reference it
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

-- ─── VIEW ────────────────────────────────────────────────────

create or replace view v_task_time as
with paired as (
  select
    l.task_id,
    l.user_id,
    l.action,
    l.ts,
    lag(l.ts)     over (partition by l.task_id order by l.ts) as prev_ts,
    lag(l.action) over (partition by l.task_id order by l.ts) as prev_action
  from activity_logs l
)
select
  t.id as task_id,
  t.user_id,
  t.us_pk,
  coalesce(sum(
    case when prev_action = 'STARTED' and action in ('PAUSED', 'COMPLETED')
         then extract(epoch from (ts - prev_ts)) end
  ), 0)::bigint
  + coalesce((
      select max(extract(epoch from (now() - l2.ts)))::bigint
        from activity_logs l2
       where l2.task_id = t.id
         and l2.action = 'STARTED'
         and not exists (
           select 1 from activity_logs l3
            where l3.task_id = t.id and l3.ts > l2.ts
         )
         and t.status = 'in_progress'
    ), 0)
  + t.manual_adjust_seconds as seconds
from tasks t
left join paired p on p.task_id = t.id
group by t.id;

alter view v_task_time set (security_invoker = true);
revoke all on v_task_time from public;
grant select on v_task_time to authenticated;
