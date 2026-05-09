-- =========================================================
-- Migration 002 — fix Security Definer View advisory.
-- Forces v_task_time to honor the calling user's RLS.
-- Safe to re-run.
-- =========================================================

alter view if exists public.v_task_time set (security_invoker = true);

-- Optional but recommended: explicit grants so RLS does the gating, not GRANT.
revoke all on public.v_task_time from public;
grant select on public.v_task_time to authenticated;
