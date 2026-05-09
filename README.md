<div align="center">
  <img src="public/brand/logo-stacked.svg" alt="QA Tracker" height="120"/>

  <h1>QA Tracker</h1>

  <p><strong>A personal QA productivity tool — Salesforce import, kanban, passive time tracking.</strong></p>

  <p>
    <a href="https://github.com/Tanishk04/qa-tracker/actions/workflows/ci.yml"><img src="https://github.com/Tanishk04/qa-tracker/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/>
    <img src="https://img.shields.io/badge/built%20with-Vite%20%2B%20React%2018%20%2B%20Supabase-d97757" alt="Stack"/>
  </p>
</div>

---

## Why this exists

Tracking QA work in a spreadsheet is brittle: timers get forgotten, statuses go stale, time-spent estimates are guesses. **QA Tracker** replaces the spreadsheet with a dedicated workspace built around how QA engineers actually work — import user stories from Salesforce once, get an auto-generated checklist per story, and let the system track time *passively* as you switch tasks. No timers. No copy-paste.

It's a **single-user tool**: one engineer, one Supabase project, your own data. Multi-tenant features (sharing, comments, mentions) intentionally do not exist.

## Features

**Import & manage**
- Paste/upload Salesforce CSV/XLSX. Maps `Name`, `User_Story_Name__c`, `Release__c`, `Quick_Hit__c`, `Status__c`, `Priority__c`, `Acceptance_Criteria__c`, `Solution_Approach__c`, `Development_Owner__c` automatically.
- Bulk-assign release on import. Auto-seeds the release picklist from imported labels.
- **Setup → Stories** tab: full grid with inline edits, sortable columns, multi-select bulk actions (release, track, archive, delete).
- **Setup → Releases**: managed picklist with one-click rename that cascades to every story.
- **Setup → Developers**: map raw Salesforce IDs to friendly names + clay-cartoon avatars (DiceBear or local SVGs).
- **Setup → Recycle Bin**: archived stories restorable; permanent delete is here, not in the drawer.

**Workflow**
- Auto-generated 5-task pipeline per story: Understand · TC Write · TC Review (optional) · SIT Test · UAT Test.
- Each release groups Major + QH1 + QH2 stories with split counts on the dashboard.
- Drag-and-drop kanban (5 columns: Not Started → In Progress → SIT → UAT → Completed) with auto-stage logic (column inferred from task state) or manual override per card.
- Evidence checkboxes on SIT (optional) and UAT (required) — UAT cannot be marked Done without it.
- Drag-and-drop priority ordering via the **Prioritize** drawer.
- Pin stories to **Today's Focus** rail.

**Time tracking — passive**
- Only one task is "in progress" globally; switching atomically pauses the previous and starts the new (with a confirmation modal so you don't lose state by accident).
- Time per task = sum of `STARTED → PAUSED|COMPLETED` intervals from the activity log, plus optional manual adjustments. Hover any task time to see the Tracked / Adjusted / Total breakdown.
- Manual adjustments can optionally count toward today's tracked time (synthetic activity-log interval at midnight today).
- Idle reminder if a task is left running too long.

**UI**
- Dark + light themes with smooth global cross-fade on toggle (no per-element flash).
- Persistent active-task bar at the top with live `HH:MM:SS` counter, pause/play.
- Quick Find palette — `Ctrl/⌘ + K` to jump to any story.
- All custom dialogs (no `window.prompt` / `window.confirm` anywhere).
- Sticky kanban column headers; one workspace scroll, columns stretch to equal height.
- Inline-editable everything (title, US ID, release, complexity, priority rank, etc.) via a single `EditableText` primitive.

**Reliability & deploy**
- Realtime: Supabase channels invalidate React Query caches on any DB change.
- Atomic state transitions via Postgres RPCs (`start_task`, `pause_current`, `complete_task`, `reopen_task`, `skip_task`, `set_evidence`).
- Row-level security throughout — each user sees only their own rows.
- View Transitions API for the theme swap; falls back to direct flip on Firefox.
- PWA-installable — there's a manifest, the install prompt picks up the brand color.

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 5 |
| Framework | React 18 + TypeScript 5 |
| Styling | Tailwind 3 (utilities) + `index.css` (design tokens, components) |
| State | TanStack Query 5 |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Backend | Supabase (Postgres + Auth + Realtime + RLS) |
| Spreadsheet I/O | `papaparse` (CSV) + `xlsx` (Excel) |
| Avatars | DiceBear `personas` (default) or local SVGs in `public/avatars/` |
| Hosting | Vercel (free tier) |

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser                                │
│  React + Vite + TS + Tailwind           │
│  React Query (cache & optimistic state) │
│  @dnd-kit (kanban + priority order)     │
│  View Transitions API (theme swap)      │
└──────────────────┬──────────────────────┘
                   │  HTTPS / WebSocket
┌──────────────────▼──────────────────────┐
│  Supabase                               │
│  ┌────────────┐  ┌──────────────────┐   │
│  │ Auth (PKCE)│  │  PostgreSQL      │   │
│  └────────────┘  │  ─ user_stories  │   │
│                  │  ─ tasks         │   │
│                  │  ─ activity_logs │   │
│                  │  ─ developers    │   │
│                  │  ─ releases      │   │
│                  │  ─ app_settings  │   │
│                  │                  │   │
│                  │  RPCs (atomic):  │   │
│                  │   start_task     │   │
│                  │   pause_current  │   │
│                  │   complete_task  │   │
│                  │   reopen_task    │   │
│                  │   skip_task      │   │
│                  │   set_evidence   │   │
│                  │   rename_release │   │
│                  │   delete_release │   │
│                  │                  │   │
│                  │  Triggers:       │   │
│                  │   create_default_│   │
│                  │     tasks (5/US) │   │
│                  │   sync_stage     │   │
│                  │     (auto-col)   │   │
│                  │                  │   │
│                  │  RLS: per-user   │   │
│                  └──────────────────┘   │
└─────────────────────────────────────────┘
```

See [`docs/SCHEMA.md`](docs/SCHEMA.md) for the full DB model.

## Quick start (local)

Requirements: Node 20+, a free Supabase project.

```bash
# 1. Clone
git clone https://github.com/Tanishk04/qa-tracker.git
cd qa-tracker

# 2. Configure env
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Supabase → Project Settings → API

# 3. Install + run
npm install
npm run dev
# → http://localhost:5173
```

**Database:** in Supabase SQL Editor, run the migration files in order:

```
supabase/schema.sql
supabase/migrations.sql
supabase/migrations_002_security.sql
supabase/migrations_003_release.sql
supabase/migrations_004_setup.sql
supabase/migrations_005_complexity_avatar.sql
supabase/migrations_006_release_cycle.sql
supabase/migrations_007_releases_picklist.sql
```

All are idempotent. After running, in Supabase → **Authentication → URL Configuration** add `http://localhost:5173` to **Site URL** and **Redirect URLs** so password-reset emails work.

## Deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full Vercel walkthrough.

Short version:

```bash
npm i -g vercel
vercel login
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel --prod
```

Then add the production URL to Supabase's Redirect URLs and you're live.

## Project layout

```
src/
  App.tsx                  # auth gate, recovery flow, layout
  main.tsx                 # React Query + theme provider
  index.css                # design tokens + component classes
  lib/
    supabase.ts            # client (PKCE, persistent session)
    types.ts               # shared types + enums
    api.ts                 # all DB / RPC calls
    importer.ts            # CSV/XLSX parsing + SF column aliasing
    csv.ts                 # export
    time.ts                # interval-based time math
    stage.ts               # auto-stage rules + stuck threshold
    developer.ts           # developer name resolution
  hooks/
    useAuth.ts
    useData.ts             # useStories / useTasks / useLogs
    useFilter.tsx          # global filter context
    useSettings.ts         # settings + developers + releases
    useTheme.ts            # external store (single source of truth)
    useTick.ts             # 1s tick for live timers
    useStartTaskGuarded.tsx# confirmation before switching active task
  components/
    Topbar.tsx             # brand, active-task pill, actions
    Dashboard.tsx          # 4 stat cards + by-release breakdown
    KanbanBoard.tsx        # 5-column board, drag-drop, drawer launch
    KanbanCard.tsx         # card with pipeline bar
    FocusPanel.tsx         # right-side pinned-stories rail
    Drawer.tsx             # story detail (tabs: Tasks/Notes/Evidence/Activity)
    Setup.tsx              # 7-tab settings (Stories/Releases/Devs/Recycle/...)
    PrioritizeDrawer.tsx   # drag-to-reorder priority ranks
    Dialog.tsx             # global confirm/prompt provider
    EditableText.tsx       # click-to-edit primitive
    TimeAdjustModal.tsx    # +/- preset time edits
    ResetPassword.tsx      # forced reset screen for recovery sessions
    Login.tsx
    Logo.tsx               # brand mark
    Icon.tsx               # lucide-style icon set
    Avatar.tsx             # local SVG or DiceBear personas
    QuickFind.tsx          # Ctrl/⌘+K palette
    ImportDialog.tsx
    Timesheet.tsx
    BulkBar.tsx
    IdleReminder.tsx
    ComplexityChip.tsx
    FilterBar.tsx
public/
  brand/                   # SVG mark + lockups
  avatars/                 # optional clay-style developer avatars
  site.webmanifest         # PWA manifest
supabase/
  schema.sql               # initial DB + RLS + triggers
  migrations_*.sql         # incremental, idempotent
docs/
  DEPLOYMENT.md
  SCHEMA.md
  CONTRIBUTING.md
```

## Status

Personal alpha. Used daily by the author. Stable enough to rely on; not hardened for multi-user / public deployment. PRs that simplify or fix bugs are welcome — see [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
