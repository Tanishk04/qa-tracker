-- =========================================================
-- QA Task Tracker — Supabase schema
-- Run in Supabase SQL editor (top to bottom)
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type task_type as enum (
    'understand','tc_write','tc_review','sit_test','sit_evidence','uat_test','uat_evidence'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('not_started','in_progress','paused','done','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type log_action as enum ('STARTED','PAUSED','COMPLETED','REOPENED','SKIPPED');
exception when duplicate_object then null; end $$;

-- ---------- TABLES ----------
create table if not exists user_stories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  us_id        text not null,
  title        text not null,
  description  text,
  priority     text,
  developer    text,
  deployed_to_uat boolean default false,
  defect_status   text,
  notes        text,
  stage        text not null default 'not_started', -- not_started|in_progress|sit|uat|completed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, us_id)
);

create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  us_pk        uuid not null references user_stories(id) on delete cascade,
  type         task_type not null,
  status       task_status not null default 'not_started',
  order_index  int not null,
  started_at   timestamptz,
  completed_at timestamptz,
  manual_adjust_seconds int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (us_pk, type)
);

create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  us_pk       uuid not null references user_stories(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  action      log_action not null,
  from_status task_status,
  to_status   task_status,
  ts          timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_us_user        on user_stories(user_id);
create index if not exists idx_us_stage       on user_stories(user_id, stage);
create index if not exists idx_tasks_user     on tasks(user_id);
create index if not exists idx_tasks_us       on tasks(us_pk);
create index if not exists idx_tasks_status   on tasks(user_id, status);
create index if not exists idx_logs_task_ts   on activity_logs(task_id, ts);
create index if not exists idx_logs_user_ts   on activity_logs(user_id, ts);

-- only one in_progress per user (enforced via partial unique)
create unique index if not exists uniq_one_in_progress
  on tasks(user_id) where status = 'in_progress';

-- ---------- ROW LEVEL SECURITY ----------
alter table user_stories  enable row level security;
alter table tasks         enable row level security;
alter table activity_logs enable row level security;

drop policy if exists us_owner on user_stories;
create policy us_owner on user_stories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists logs_owner on activity_logs;
create policy logs_owner on activity_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- HELPERS ----------
create or replace function _touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_us_touch on user_stories;
create trigger trg_us_touch before update on user_stories
  for each row execute function _touch_updated_at();

drop trigger if exists trg_tasks_touch on tasks;
create trigger trg_tasks_touch before update on tasks
  for each row execute function _touch_updated_at();

-- ---------- AUTO-CREATE TASKS WHEN A US IS INSERTED ----------
create or replace function create_default_tasks() returns trigger language plpgsql as $$
declare
  defs constant text[][] := array[
    array['understand','1'],
    array['tc_write','2'],
    array['tc_review','3'],
    array['sit_test','4'],
    array['sit_evidence','5'],
    array['uat_test','6'],
    array['uat_evidence','7']
  ];
  i int;
begin
  for i in 1 .. array_length(defs,1) loop
    insert into tasks(user_id, us_pk, type, order_index)
    values (new.user_id, new.id, defs[i][1]::task_type, defs[i][2]::int)
    on conflict do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trg_us_create_tasks on user_stories;
create trigger trg_us_create_tasks after insert on user_stories
  for each row execute function create_default_tasks();

-- ---------- ATOMIC: START A TASK (pauses current active) ----------
create or replace function start_task(p_task uuid) returns void language plpgsql security definer as $$
declare
  v_user uuid := auth.uid();
  v_current uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  -- pause currently active task (if any & different)
  select id into v_current from tasks
    where user_id = v_user and status = 'in_progress' and id <> p_task
    limit 1;

  if v_current is not null then
    update tasks set status = 'paused' where id = v_current and user_id = v_user;
    insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
      select user_id, us_pk, id, 'PAUSED','in_progress','paused' from tasks where id = v_current;
  end if;

  -- start the new task
  update tasks
     set status = 'in_progress',
         started_at = coalesce(started_at, now())
   where id = p_task and user_id = v_user;

  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'STARTED', null, 'in_progress' from tasks where id = p_task;
end $$;

-- ---------- ATOMIC: PAUSE CURRENT ----------
create or replace function pause_current() returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'paused'
    where user_id = v_user and status = 'in_progress';
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'PAUSED','in_progress','paused'
      from tasks where user_id = v_user and status = 'paused' and updated_at >= now() - interval '2 seconds';
end $$;

-- ---------- ATOMIC: COMPLETE ----------
create or replace function complete_task(p_task uuid) returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid(); v_prev task_status;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select status into v_prev from tasks where id = p_task and user_id = v_user;

  update tasks
     set status = 'done', completed_at = now()
   where id = p_task and user_id = v_user;

  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'COMPLETED', v_prev, 'done' from tasks where id = p_task;
end $$;

-- ---------- ATOMIC: REOPEN ----------
create or replace function reopen_task(p_task uuid) returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'not_started', completed_at = null
    where id = p_task and user_id = v_user;
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'REOPENED', 'done', 'not_started' from tasks where id = p_task;
end $$;

-- ---------- ATOMIC: SKIP ----------
create or replace function skip_task(p_task uuid) returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set status = 'skipped' where id = p_task and user_id = v_user;
  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'SKIPPED', null, 'skipped' from tasks where id = p_task;
end $$;

-- ---------- VIEW: time spent per task (seconds) ----------
create or replace view v_task_time as
with paired as (
  select
    l.task_id,
    l.user_id,
    l.action,
    l.ts,
    lag(l.ts) over (partition by l.task_id order by l.ts) as prev_ts,
    lag(l.action) over (partition by l.task_id order by l.ts) as prev_action
  from activity_logs l
)
select
  t.id as task_id,
  t.user_id,
  t.us_pk,
  coalesce(sum(
    case when prev_action = 'STARTED' and action in ('PAUSED','COMPLETED')
         then extract(epoch from (ts - prev_ts)) end
  ),0)::bigint
  + coalesce((select max(extract(epoch from (now() - l2.ts)))::bigint
              from activity_logs l2
              where l2.task_id = t.id
                and l2.action = 'STARTED'
                and not exists (
                  select 1 from activity_logs l3
                  where l3.task_id = t.id and l3.ts > l2.ts
                )
                and t.status = 'in_progress'), 0)
  + t.manual_adjust_seconds as seconds
from tasks t
left join paired p on p.task_id = t.id
group by t.id;

alter view v_task_time set (security_invoker = true);
revoke all on v_task_time from public;
grant select on v_task_time to authenticated;
