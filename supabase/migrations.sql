-- =========================================================
-- Migration 001 — collapse evidence into checkbox + auto-stage
-- Safe to re-run.
-- =========================================================

-- 1. New columns on tasks: evidence_required, evidence_uploaded
alter table tasks
  add column if not exists evidence_required boolean not null default false,
  add column if not exists evidence_uploaded boolean not null default false;

-- 2. Per-story auto-stage toggle
alter table user_stories
  add column if not exists auto_stage boolean not null default true;

-- 3. Drop deprecated tasks (sit_evidence / uat_evidence) — evidence is now a
--    flag on sit_test / uat_test instead of a separate task.
delete from tasks where type in ('sit_evidence', 'uat_evidence');

-- 4. Mark uat_test as evidence-required, sit_test as optional, for existing rows
update tasks set evidence_required = true  where type = 'uat_test';
update tasks set evidence_required = false where type = 'sit_test';

-- 5. Replace create_default_tasks: only 5 tasks per US now
create or replace function create_default_tasks() returns trigger language plpgsql as $$
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

-- 6. Stage compute logic
create or replace function compute_stage(p_us uuid) returns text language plpgsql as $$
declare
  v_uat_done   boolean;
  v_uat_active boolean;
  v_sit_done   boolean;
  v_sit_active boolean;
  v_any_active boolean;
  v_any_started boolean;
  v_uat_evidence_ok boolean;
begin
  select status = 'done',
         status = 'in_progress',
         (status = 'done' and (not evidence_required or evidence_uploaded))
    into v_uat_active, v_uat_active, v_uat_evidence_ok
  from tasks where us_pk = p_us and type = 'uat_test';

  -- Re-fetch correctly (the multi-assign above only sets one row)
  select (status = 'done')        into v_uat_done   from tasks where us_pk = p_us and type = 'uat_test';
  select (status = 'in_progress') into v_uat_active from tasks where us_pk = p_us and type = 'uat_test';
  select (status in ('done','skipped')) into v_sit_done   from tasks where us_pk = p_us and type = 'sit_test';
  select (status = 'in_progress') into v_sit_active from tasks where us_pk = p_us and type = 'sit_test';

  select bool_or(status = 'in_progress'),
         bool_or(status in ('in_progress','paused','done','skipped'))
    into v_any_active, v_any_started
  from tasks where us_pk = p_us;

  if v_uat_done and v_uat_evidence_ok then return 'completed'; end if;
  if v_uat_active or v_sit_done       then return 'uat';       end if;
  if v_sit_active                     then return 'sit';       end if;
  if v_any_active or v_any_started    then return 'in_progress'; end if;
  return 'not_started';
end $$;

-- 7. Trigger to keep user_stories.stage in sync (only when auto_stage = true)
create or replace function _sync_stage() returns trigger language plpgsql as $$
declare
  v_us uuid := coalesce(new.us_pk, old.us_pk);
  v_auto boolean;
  v_new text;
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

-- 8. Evidence setter RPC
create or replace function set_evidence(p_task uuid, p_value boolean)
returns void language plpgsql security definer as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update tasks set evidence_uploaded = p_value where id = p_task and user_id = v_user;
end $$;

-- 9. Tighten complete_task: enforce evidence_required for UAT
create or replace function complete_task(p_task uuid) returns void language plpgsql security definer as $$
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

  update tasks
     set status = 'done', completed_at = now()
   where id = p_task and user_id = v_user;

  insert into activity_logs(user_id, us_pk, task_id, action, from_status, to_status)
    select user_id, us_pk, id, 'COMPLETED', v_prev, 'done' from tasks where id = p_task;
end $$;

-- 10. Recompute stages once for all existing stories
update user_stories us
   set stage = compute_stage(us.id)
 where auto_stage = true;
