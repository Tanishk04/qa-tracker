# Database schema

Single Postgres database in Supabase. All tables enforce row-level security (`auth.uid() = user_id`) so each user only ever sees their own data. State transitions go through SECURITY-DEFINER RPCs to keep them atomic.

---

## Migration order

Apply in order. All idempotent.

| File | Adds |
|---|---|
| `schema.sql` | Initial tables, enums, RLS, triggers, RPCs |
| `migrations.sql` | Setup-page columns: `evidence_required/uploaded`, `auto_stage`, stage-sync trigger |
| `migrations_002_security.sql` | `security_invoker` on `v_task_time` view |
| `migrations_003_release.sql` | `release_label`, `is_quick_hit`, `pinned`, `sf_status`, `acceptance_criteria`, `solution_approach` |
| `migrations_004_setup.sql` | `developers`, `app_settings`, `priority_rank`, `archived` |
| `migrations_005_complexity_avatar.sql` | `complexity`, `avatar_seed` |
| `migrations_006_release_cycle.sql` | `release_cycle` (legacy, hidden from UI) |
| `migrations_007_releases_picklist.sql` | `releases` table, `release_track` column, `rename_release_v2` / `delete_release` RPCs |

---

## Tables

### `user_stories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `user_id` | uuid | FK → auth.users; RLS gate |
| `us_id` | text | display id, unique per user (e.g. `US-06655`) |
| `title` | text | |
| `description` | text | |
| `priority` | text | `High` / `Medium` / `Low` (Salesforce-sourced) |
| `complexity` | text | `XS` / `S` / `M` / `L` / `XL` (manual) |
| `priority_rank` | int | manual order from Prioritize drawer |
| `developer` | text | raw SF user id; resolved via `developers` table |
| `release_label` | text | FK-like to `releases.name` (loose; not enforced) |
| `release_track` | text | check constraint: `major` / `qh1` / `qh2` |
| `is_quick_hit` | bool | derived/legacy; mirrors `release_track ≠ 'major'` |
| `pinned` | bool | shows in Today's Focus rail |
| `archived` | bool | hidden from main board; lives in Recycle Bin |
| `auto_stage` | bool | when true, `stage` is overwritten by trigger |
| `stage` | text | `not_started` / `in_progress` / `sit` / `uat` / `completed` |
| `sf_status` | text | Salesforce `Status__c` (free text) |
| `acceptance_criteria` | text | |
| `solution_approach` | text | |
| `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

Unique index: `(user_id, us_id)`.

### `tasks`

5 rows per story, auto-created by `create_default_tasks` trigger on `user_stories` insert.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `us_pk` | uuid | FK → user_stories.id, ON DELETE CASCADE |
| `user_id` | uuid | RLS gate |
| `type` | task_type enum | `understand` / `tc_write` / `tc_review` / `sit_test` / `uat_test` |
| `status` | task_status enum | `not_started` / `in_progress` / `paused` / `done` / `skipped` |
| `order_index` | int | 1..5 |
| `evidence_required` | bool | true for `uat_test` only |
| `evidence_uploaded` | bool | manual checkbox |
| `manual_adjust_seconds` | int | added to total task time |
| `started_at`, `completed_at`, `updated_at` | timestamptz | |

Partial unique index: `(user_id) WHERE status = 'in_progress'` — enforces the global "one active task" invariant at the DB level.

### `activity_logs`

Append-only event log. Time-spent calculations rely on `STARTED → PAUSED|COMPLETED` interval pairs.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `task_id`, `us_pk`, `user_id` | uuid | FKs |
| `action` | log_action enum | `STARTED` / `PAUSED` / `COMPLETED` / `REOPENED` / `SKIPPED` |
| `from_status`, `to_status` | task_status enum | snapshot of the transition |
| `ts` | timestamptz | |

### `developers`, `app_settings`, `releases`

See migrations_004 / migrations_007 for the column list. Standard CRUD, RLS-protected.

---

## RPCs (SECURITY DEFINER)

State-transition functions called from the client. Atomic — they handle the "pause current then start new" two-step in a single DB call.

| RPC | Purpose |
|---|---|
| `start_task(p_task uuid)` | Pauses any currently-running task, sets target to `in_progress`, writes activity logs |
| `pause_current()` | Pauses the user's currently active task (if any) |
| `complete_task(p_task uuid)` | Marks task done; refuses if `evidence_required` and not uploaded |
| `reopen_task(p_task uuid)` | Marks done task as `not_started` |
| `skip_task(p_task uuid)` | Marks task as `skipped` |
| `set_evidence(p_task uuid, p_value bool)` | Toggles `evidence_uploaded` |
| `rename_release_v2(p_old text, p_new text)` | Renames a release across the picklist + every story that references it |
| `delete_release(p_name text)` | Removes a release from the picklist + clears it on referencing stories |

---

## Triggers

| Trigger | Fires on | What it does |
|---|---|---|
| `create_default_tasks` | `user_stories` AFTER INSERT | Inserts the 5 task rows for the new story |
| `sync_stage` | `tasks` AFTER UPDATE | If parent story has `auto_stage = true`, recomputes `user_stories.stage` from task statuses |

---

## RLS

Every table has a single policy:

```sql
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
```

User signs in → JWT contains their `sub` → all queries automatically filter to their rows. There is no admin / service role usage from the client.

---

## Views

`v_task_time` — convenience view that sums per-task tracked seconds from `activity_logs`. Set `security_invoker = true` so it honors RLS. Mostly useful for ad-hoc Postgres queries; the app does the same math client-side in `src/lib/time.ts`.
