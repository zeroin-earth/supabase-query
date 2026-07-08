# supabase-query

React + React Native hooks library for Supabase with offline-first support, powered by `@tanstack/react-query`. Ported from `@zeroin.earth/appwrite-graphql`.

**The migration blueprint is `SUPABASE_MIGRATION_PLAN.md` — read it first.** It has the phase plan, the Appwrite→Supabase mapping tables, manual setup steps, and a Progress Tracker (§9). Update the tracker when you finish a phase.

## Toolchain

- **Runtime/pkg manager:** Bun. `bun install`, `bun run <script>`, `bun test`, `bunx`.
- **Bundler:** `tsdown` (Rolldown-based, tsup successor). Dual build → `dist/` (web) and `react-native/`. Config in `tsdown.config.ts`. ESM output is `.mjs`/`.d.mts`, CJS is `.cjs`/`.d.cts`.
- **Tests:** `bun test` + happy-dom (registered in `tests/setup/preload.ts`). **Not vitest/jest.**
- **Lint/format:** ESLint (flat config, `simple-import-sort`, `consistent-type-imports`) + Prettier.

## Conventions

- After changing source or tests, run `bun run lint` and `bun run test` before considering work done. Keep `bun run typecheck` clean.
- Keep the public hook API stable vs. the Appwrite original where a Supabase equivalent exists — consumers should mostly swap imports/IDs, not rewrite.
- The offline engine (`src/offline/`) is the crown jewel: preserve its control flow (persist → pause → replay → resolve conflict); only its backend calls change.
- Shared/platform-neutral code lives in `src/index.shared.ts`. Web-only exports go in `src/index.ts`, RN-only in `src/native-entry.ts`, so DOM code and RN-only deps never mix.
- `@supabase/supabase-js` is one universal client (web + RN) — no per-service objects, no `appwrite`/`react-native-appwrite` split.

## Supabase-specific notes

- Data calls return `{ data, error }` and never throw — unwrap and `throw error` so TanStack's error path works.
- Access control is **RLS policies**, not per-row permission strings. No `permissions` argument on hooks.
- Local backend for dev/tests: `supabase start` (Docker stack + Studio + Inbucket for emails).
- Regenerate DB types after every schema change: `bun run gen:types`.
