# CLAUDE.md — guidance for AI agents working on this repo

This file is read by Claude Code (and other AI coding agents) when they enter the repo. Keep instructions short and concrete; long preambles waste context.

## Big picture

QA Tracker is a **single-user personal tool**. One QA engineer, one Supabase project, their own Salesforce data. Multi-tenant features (sharing, comments, mentions) intentionally do not exist. When in doubt, prefer the simpler implementation.

## Stack

Vite 5 · React 18 + TS 5 · Tailwind 3 (utilities) + plain CSS in `index.css` (design tokens, components) · TanStack Query 5 · `@dnd-kit/{core,sortable}` · Supabase (Auth + Postgres + Realtime + RLS).

## Where to add things

| You're adding... | Put it here |
|---|---|
| A new UI screen | `src/components/` (component file = file name) |
| A new hook | `src/hooks/` |
| Pure logic (math, parsing, type) | `src/lib/` |
| A new API call | `src/lib/api.ts` (don't sprinkle `supabase.from(...)` across components) |
| A new DB column or table | `supabase/migrations_NNN_<name>.sql` (idempotent, append-only) |
| Static asset (icon, brand) | `public/` |
| Docs | `docs/` |

## Patterns to follow

1. **Dialogs.** Never use `window.prompt` / `window.confirm` / `window.alert`. Use `useDialog()` from `Dialog.tsx`.
2. **Inline editing.** Use `EditableText` from `EditableText.tsx`. Don't roll your own click-to-edit.
3. **Picklists in dark mode.** Native `<select>` with class `fld` works (option styling is forced by `index.css`). For richer picklists, see `ComplexityChip.tsx`.
4. **Time math.** `src/lib/time.ts`. `computeTaskBreakdown()` returns `{ trackedSec, adjustSec, totalSec }`. Don't recompute intervals elsewhere.
5. **Theme.** Use CSS variables (`var(--bg)`, `var(--text)`, `var(--accent)`...). The only hardcoded colors are the brand mark (`#D87749` / `#FBF7F2`) — see `Logo.tsx`.
6. **State transitions on tasks.** Always go through the SECURITY-DEFINER RPCs (`rpcStartTask`, `rpcPauseCurrent`, `rpcCompleteTask`, `rpcReopenTask`, `rpcSkipTask`, `rpcSetEvidence`). Direct updates to `tasks.status` will violate the "one active task" partial unique index.
7. **Starting a task from any UI surface** — go through `useStartTaskGuarded()`, not `rpcStartTask` directly. The hook prompts before stealing focus from a running task.
8. **Realtime invalidation.** Adding a new table? Add a subscription in `src/App.tsx`'s realtime channel.
9. **Filter context.** Top-level filter (search, release, track, pinned, etc.) lives in `useFilter`. Add new dimensions there, don't pass props down.

## Things to NOT do

- Don't add a new dependency unless it replaces something larger or saves >100 lines. The user explicitly cares about a small bundle.
- Don't add `window.prompt` / `confirm` / `alert`. We've removed every one.
- Don't add per-column scrollbars to the kanban (one workspace scroll, columns stretch to equal height).
- Don't introduce a new color palette. Use the existing tokens.
- Don't write to multiple tables from a component without an RPC. If two writes need to be atomic, write a Postgres function and add it to `supabase/migrations_*.sql`.

## Common tasks

- **Add a column to user_stories** — write `supabase/migrations_NNN_<name>.sql`, extend `UserStory` type in `lib/types.ts`, surface in `Drawer.tsx` and/or `Setup.tsx → StoriesTab`. Update CSV export in `lib/csv.ts`.
- **Add a new task type** — change `task_type` enum + the auto-create trigger in `migrations.sql`, update `TASK_LABELS` and `TASK_ORDER` in `lib/types.ts`. Card pipeline bar will pick it up automatically.
- **Add a Setup tab** — extend the `Tab` union in `Setup.tsx`, add the side-tab button + render the new `*Tab` component you author at the bottom of the file.

## Verifying

```bash
npm run type-check
npm run build
```

Both must pass before commit. CI runs both on push.

## Out of scope

- Multi-user sharing
- Mobile app
- Offline support beyond what Supabase Realtime gives for free
- AI features (summarization, suggestions) — adds dependencies and noise

If a request would push past the boundaries above, surface that to the user before implementing.
