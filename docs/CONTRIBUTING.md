# Contributing

This is a single-user personal tool, but PRs that simplify code or fix bugs are welcome.

## Setup

```bash
git clone https://github.com/Tanishk04/qa-tracker.git
cd qa-tracker
cp .env.example .env
# fill in your own Supabase URL + anon key
npm install
npm run dev
```

## Before you push

```bash
npm run type-check  # must pass
npm run build       # must compile
```

CI runs both on every push and PR.

## Patterns to follow

- **No new top-level dependencies** unless they replace something larger or remove >100 lines.
- **No `window.prompt` / `window.confirm` / `window.alert`** — use `useDialog()` from `src/components/Dialog.tsx`.
- **Inline editing** — use the `EditableText` primitive, don't roll your own.
- **DB writes** — go through `src/lib/api.ts`. State transitions on tasks must use the SECURITY-DEFINER RPCs (don't update `tasks.status` directly).
- **Theme** — read CSS variables (`var(--bg)`, `var(--text)`, etc.). Don't hardcode colors except for the brand mark (`#D87749` / `#FBF7F2`).
- **Time math** — `src/lib/time.ts`. Don't recompute intervals elsewhere.
- **Realtime** — table changes auto-invalidate the matching React Query key in `src/App.tsx`. If you add a new table, add a subscription there.

## Branch & commit

- Branch from `main`. Name it `feat/...`, `fix/...`, or `docs/...`.
- Conventional-ish commit messages: `feat: add ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Squash on merge.

## File layout cheat sheet

| Layer | Where |
|---|---|
| UI components | `src/components/` |
| Hooks (state, data) | `src/hooks/` |
| Pure logic, types, API | `src/lib/` |
| DB migrations | `supabase/` (incremental, idempotent) |
| Static assets (icons, brand) | `public/` |
| Docs | `docs/` |

## Bugs / ideas

Open an issue at <https://github.com/Tanishk04/qa-tracker/issues>. Include browser + OS, exact reproduction steps, and any console errors.
