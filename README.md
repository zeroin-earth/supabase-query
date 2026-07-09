# @zeroin.earth/supabase-query

React + React Native hooks for [Supabase](https://supabase.com), with **offline-first** support, powered by [`@tanstack/react-query`](https://tanstack.com/query).

One universal `@supabase/supabase-js` client covers the database, auth, storage, realtime, functions, and RPC. This library wraps it in a uniform, fully-typed hook API: `useRow`/`useRows` CRUD, optimistic updates, a fluent filter builder, realtime subscriptions, a persisted query cache, and a paused-mutation queue that replays on reconnect.

---

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [The factory: `createSupabaseQuery<Database>()`](#the-factory-createsupabasequerydatabase)
- [Data hooks (`db/`)](#data-hooks-db)
- [Filtering with the QueryBuilder](#filtering-with-the-querybuilder)
- [Realtime](#realtime)
- [Access control is RLS, not permissions](#access-control-is-rls-not-permissions)
- [Offline-first](#offline-first)
- [Auth](#auth)
- [Storage](#storage)
- [Edge Functions & RPC](#edge-functions--rpc)
- [Teams (library-owned module)](#teams-library-owned-module)
- [Push notifications (library-owned module)](#push-notifications-library-owned-module)
- [Installing a library-owned module (SQL ＋ function ＋ secrets)](#installing-a-library-owned-module-sql--function--secrets)
- [React Native setup](#react-native-setup)
- [API reference](#api-reference)

---

## Install

```bash
bun add @zeroin.earth/supabase-query @supabase/supabase-js @tanstack/react-query
# or: npm i / pnpm add / yarn add
```

**Peer dependencies:**

| Package                                     | Required on | Notes                                              |
| ------------------------------------------- | ----------- | -------------------------------------------------- |
| `@supabase/supabase-js`                     | all         | The one universal client.                          |
| `@tanstack/react-query`                     | all         | The query/mutation engine.                         |
| `react`                                     | all         |                                                    |
| `@react-native-async-storage/async-storage` | RN only     | GoTrue session storage **and** the offline cache.  |
| `@react-native-community/netinfo`           | RN only     | Network-state adapter for offline queuing.         |
| `react-native-url-polyfill`                 | RN only     | `supabase-js` needs a URL polyfill on RN.          |

The RN peers are optional — install them only for the React Native entry (`@zeroin.earth/supabase-query/react-native`).

---

## Quick start

**1. Generate your `Database` type** (once, and after every schema change):

```bash
supabase gen types typescript --local > src/database.types.ts
# or against the cloud: --project-id <ref>
```

**2. Build the typed hooks once, in one module:**

```ts
// src/lib/supabase.ts
import { createSupabaseClient, createSupabaseQuery } from '@zeroin.earth/supabase-query'
import type { Database } from '../database.types'

export const client = createSupabaseClient<Database>({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
})

export const {
  SupabaseProvider,
  useRow,
  useRows,
  useCreateRow,
  useUpdateRow,
  useDeleteRow,
  useUser,
  useLogin,
  // …every hook, bound to your Database type
} = createSupabaseQuery<Database>()
```

**3. Wrap your app:**

```tsx
import { SupabaseProvider, client } from './lib/supabase'

export default function App() {
  return (
    <SupabaseProvider client={client}>
      <Todos />
    </SupabaseProvider>
  )
}
```

**4. Use the hooks — table names autocomplete, row types infer, no generics:**

```tsx
import { useRows, useCreateRow } from './lib/supabase'

function Todos() {
  const { rows, total, isPending } = useRows('todos', (q) => q.eq('done', false).order('created_at'))
  const { mutate: createTodo } = useCreateRow()

  if (isPending) return <Spinner />
  return (
    <>
      <p>{total} open</p>
      {rows?.map((t) => <TodoItem key={t.id} todo={t} />)}
      <button onClick={() => createTodo({ table: 'todos', values: { title: 'New' } })}>Add</button>
    </>
  )
}
```

---

## The factory: `createSupabaseQuery<Database>()`

Call the factory **once** per app with your generated `Database` type. It returns the platform-correct `SupabaseProvider` plus the entire hook set, each hook bound to your schema:

- Table names autocomplete against your real tables.
- Row types infer — `useRow('todos', id)` gives you `Todo`, no `<Row>` generic.
- Filters are checked against real columns.

The `db/` and `functions/` RPC hooks are `Database`-typed; the fixed-shape modules (`auth/`, `storage/`, `teams/`, `push/`) are library-owned and not schema-parameterized.

You can also import any hook standalone (e.g. `import { useRows } from '@zeroin.earth/supabase-query'`) and pass row types explicitly — but the factory is the ergonomic path.

**Advanced client:** build your own `createClient<Database>(…)` and pass it as `<SupabaseProvider client={{ supabase }}>` if you need custom options.

---

## Data hooks (`db/`)

Postgres has one table API, so the vocabulary is `schema → table → row`.

| Hook                                                    | Purpose                                                  |
| ------------------------------------------------------- | -------------------------------------------------------- |
| `useRow(table, id, opts?)` / `useSuspenseRow`           | Read one row (`.single()`), live via realtime.           |
| `useRows(table, builder?, opts?)` / `useSuspenseRows`   | Read a list; returns `{ rows, total }` (`count:'exact'`).|
| `useInfiniteRows(table, builder?, opts?)`               | Keyset-paginated infinite scroll.                        |
| `useRowsWithPagination(table, builder?, opts?)`         | Offset/`range()` pagination.                             |
| `useCreateRow()`                                         | Insert; optimistic. `{ table, values }`.                 |
| `useUpdateRow()`                                         | Partial update; optimistic. `{ table, id, values }`.     |
| `useUpsertRow()`                                         | Upsert with `onConflict`. `{ table, values, onConflict }`.|
| `useDeleteRow()`                                         | Delete; optimistic. `{ table, id }`.                     |
| `useIncrementColumn()` / `useDecrementColumn()`         | Atomic `col = col ± n` via an RPC (see [RPC](#edge-functions--rpc)). |

Reads default to `schema: 'public'`, `select: '*'`, and `subscribe: true` (live realtime). Rows are plain typed column objects; the primary key is a first-class `id` column.

Every mutation variable carries `table` (and optional `schema`) so the offline replay queue can reconstruct the call from persisted variables alone.

```tsx
const { mutate: update } = useUpdateRow()
update({ table: 'todos', id, values: { done: true } }) // optimistic; rolls back on error
```

---

## Filtering with the QueryBuilder

`useRows`/`useInfiniteRows`/`useRowsWithPagination` take a fluent builder as their second argument. It records a **serializable descriptor** that is both hashed into the query key (so keys stay stable) and replayed onto the PostgREST query:

```tsx
useRows('posts', (q) =>
  q.eq('published', true)
    .in('author_id', authorIds)
    .ilike('title', '%supabase%')
    .order('created_at', { ascending: false })
    .limit(20),
)
```

Methods mirror PostgREST: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `contains`, `containedBy`, `textSearch`, `or`, `not`, plus modifiers `order`, `limit`, `range`, `select`.

**Geo (PostGIS):** `distance*` / spatial predicates route to a SQL RPC you install (e.g. `ST_DWithin`), passed via `opts.geoRpc`. See the [migration plan §5 / §8.7](SUPABASE_MIGRATION_PLAN.md) for the `geography(Point,4326)` column + GiST index + RPC pattern.

---

## Realtime

Reads subscribe automatically (`subscribe: true`). The shared `subscribeToTable` helper updates the row cache and invalidates list keys on `postgres_changes`. Opt out per hook with `{ subscribe: false }`.

Three **manual** setup steps are required per table (they can't be done from the client):

1. Add the table to the publication: `alter publication supabase_realtime add table public.todos;`
2. RLS is enforced on realtime — a client only receives changes to rows it can `SELECT`.
3. `UPDATE`/`DELETE` payloads include `old` columns only with `alter table public.todos replica identity full;`

---

## Access control is RLS, not permissions

Supabase enforces access with **Row Level Security policies** on the table, not per-row permission arguments on the client. The hooks take **no `permissions` argument** — the database decides who can read and write each row.

Enable RLS on **every** table and write policies:

```sql
alter table public.todos enable row level security;

create policy "select own" on public.todos for select using (auth.uid() = user_id);
create policy "insert own" on public.todos for insert with check (auth.uid() = user_id);
create policy "update own" on public.todos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.todos for delete using (auth.uid() = user_id);
```

Without RLS enabled, the `anon`/`authenticated` roles can read and write everything.

---

## Offline-first

The offline engine follows one control flow: **persist → pause → replay → resolve conflict**.

- **Persisted query cache** — successful queries are dehydrated to storage and rehydrated on launch.
- **Paused-mutation queue** — mutations made offline are queued and replayed automatically on reconnect.
- **Three-way conflict resolution** — `last-write-wins` (default), `server-wins`, `merge-shallow`, or a custom function.

Use `createOfflineClient` instead of `createSupabaseClient` to get a pre-wired `QueryClient` + persister:

```ts
import { createOfflineClient, webNetworkAdapter } from '@zeroin.earth/supabase-query'

const client = createOfflineClient({
  url, anonKey,
  networkAdapter: webNetworkAdapter,     // reactNativeNetworkAdapter on RN
  storage: window.localStorage,          // batteries-included persister
  conflictStrategy: 'last-write-wins',
})

// <SupabaseProvider client={client} queryClient={client.queryClient} persister={client.persister}>
```

> **Only _data_ mutations queue offline.** These are online-only and intentionally **out** of the replay registry (they mint tokens / run RPCs / call Edge Functions server-side):
> - **all auth mutations** (login, signup, `updateUser`, MFA…) — GoTrue is inherently online;
> - **teams**: `useCreateTeam` and every membership op (RPC / Edge Function). Only the plain-table team writes — `useUpdateTeamName`, `useUpdateTeamPrefs`, `useDeleteTeam` — queue offline;
> - **push**: `useRegisterDevice` / `useUnregisterDevice` (need a live session) and `useSendPush`.
>
> Don't expect offline login or offline device registration.

---

## Auth

GoTrue-backed hooks over `supabase.auth`. Access = RLS, so there's no per-row permission API here.

```tsx
const { mutate: login } = useLogin()
login({ email, password })

const { user } = useUser()          // reactive to onAuthStateChange
const { mutate: logout } = useLogout()
```

| Hook                                    | Backend call                                        |
| --------------------------------------- | --------------------------------------------------- |
| `useUser` / `useSuspenseUser`           | `auth.getUser()`                                     |
| `useSession`                            | `auth.getSession()`                                  |
| `useSignUp`                             | `auth.signUp({ email, password, options.data })`     |
| `useLogin`                              | `auth.signInWithPassword`                            |
| `useLogout`                             | `auth.signOut`                                        |
| `useOAuthLogin`                         | `auth.signInWithOAuth({ provider })` (lowercase str) |
| `useMagicLink`                          | `auth.signInWithOtp`                                 |
| `useEmailOtp` / `usePhoneOtp`           | `signInWithOtp` → `verifyOtp`                         |
| `useAnonymousLogin`                     | `auth.signInAnonymously` (enable in dashboard)       |
| `useUpdateUser`                         | `auth.updateUser` (name/prefs → `user_metadata`)     |
| `usePasswordRecovery` / `useResetPassword` | `resetPasswordForEmail` → `updateUser({ password })` |
| `useVerification`                       | `verifyOtp` / `resend`                               |
| `useMfa`                                | `auth.mfa.*`                                          |
| `useIdentities`                         | `auth.getUserIdentities` / `link` / `unlink`         |

> **No client API to list all sessions** (`auth.admin` is server-only) — there is no `useListSessions`. Configure providers, redirect URLs, email templates, and MFA in **Studio → Authentication**.

---

## Storage

Hooks over `supabase.storage.from(bucket)`. Buckets are created by you (Studio → Storage), not at runtime.

| Hook              | Call                                                   |
| ----------------- | ------------------------------------------------------ |
| `useFiles`        | `.list()`                                              |
| `useFile`         | list/metadata                                          |
| `useCreateFile`   | `.upload()` — `{ bucket, path, file, options }`        |
| `useUpdateFile`   | `.update()`                                            |
| `useDeleteFile`   | `.remove()`                                            |
| `useFileDownload` | `.download()`                                          |
| `useFileView` / `useFilePreview` | `.getPublicUrl()` (public buckets)      |
| `useSignedUrl`    | `.createSignedUrl()` (private buckets)                 |

For private buckets, add `storage.objects` RLS policies.

---

## Edge Functions & RPC

```tsx
// Invoke an Edge Function
const { mutate: run } = useFunction()
run({ name: 'my-func', body: { /* … */ } })

// Read via RPC (query)
const { data } = useRpc('places_within', { p_lat, p_lng, p_meters: 500 })

// Mutate via RPC
const { mutate } = useCallRpc('increment_column')
mutate({ p_table: 'todos', p_id: id, p_column: 'views', p_amount: 1 })
```

RPC covers two things PostgREST can't express as chained filters:

- **Increment/decrement** — PostgREST can't do `col = col + 1`; install an `increment_column` RPC ([plan §8.7](SUPABASE_MIGRATION_PLAN.md)).
- **Staged transactions** — model atomic multi-step work as a bespoke Postgres function invoked via `.rpc()`.

> Listing function executions has **no** client API — there is no `useListExecutions` / `useGetExecution`.

---

## Teams (library-owned module)

Supabase has no teams primitive, so the **library owns the schema** and ships it as a versioned SQL artifact (`sql/teams/0001_init.sql`) — the same category as `auth/` and `storage/`. Consumers *adopt* the schema; they don't design it. That's what makes teams transportable across projects.

- **Roles are consumer-defined** (`roles text[]`); the library reserves exactly one structural role: **`'owner'`**. Pass a union for autocomplete: `makeTeamsHooks<'owner' | 'editor' | 'viewer'>()`.
- **Status is fixed**: `pending | active | inactive | blocked`.
- **Invites are by email**, via the `team-invite` Edge Function (provisioning a user + sending mail needs the service role).

```tsx
const { teams } = useTeams()
const { mutate: createTeam } = useCreateTeam()
createTeam({ name: 'Engineering', prefs: { color: 'blue' } })

const { mutate: invite } = useCreateMembership()
invite({ teamId, email: 'alice@example.com', roles: ['editor'] })
```

Read hooks: `useTeams`, `useTeam`, `useTeamPrefs`, `useTeamMemberships`, `useTeamMembership`. Writes: `useCreateTeam` (RPC), `useUpdateTeamName`/`useUpdateTeamPrefs`/`useDeleteTeam` (plain table — **offline-queueable**), `useCreateMembership` (Edge Function), `useUpdateMembership`/`useUpdateMembershipStatus`/`useDeleteMembership` (RPC).

**Install:** see [below](#installing-a-library-owned-module-sql--function--secrets) — this module ships an Edge Function, so it's a **3-part install**.

---

## Push notifications (library-owned module)

Two halves: **client-side token registration** (in this library) and a **server-side sender** (the `send-push` Edge Function, which holds the provider secrets). It branches by platform:

- **Native (iOS/Android)** → Expo Push API (fans out to APNs + FCM — no certs needed).
- **Web** → FCM HTTP v1 with a service-account JWT.

```tsx
// after acquiring a token from expo-notifications / Firebase getToken():
const { mutate: register } = useRegisterDevice()
register({ token, platform: 'ios', provider: 'expo' })

const { mutate: send } = useSendPush()
send({ userIds: [uid], title: 'Hi', body: 'You have a new message' })
```

`useDeviceTokens` lists the current user's tokens (RLS-scoped). Call `useUnregisterDevice` on logout. `device_tokens` is a fixed shape the library owns (`sql/push/0001_init.sql`).

**App-side token acquisition is the consumer's responsibility** (not bundled):

- **Native:** `expo-notifications` → request permission → `getExpoPushTokenAsync()` → `useRegisterDevice({ token, platform, provider: 'expo' })`.
- **Web:** register the Firebase messaging service worker → `getToken({ vapidKey })` → `useRegisterDevice({ token, platform: 'web', provider: 'fcm' })`.

**Install:** [below](#installing-a-library-owned-module-sql--function--secrets) — also a **3-part install**.

---

## Installing a library-owned module (SQL ＋ function ＋ secrets)

Both `teams` and `push` ship an Edge Function. **The installer only stamps the SQL** — you must also deploy the function and set its secrets, or the module ships with a dead function. Three steps per module:

### 1. Stamp the SQL

```bash
npx @zeroin.earth/supabase-query add teams   # → supabase/migrations/<ts>_teams.sql
npx @zeroin.earth/supabase-query add push    # → supabase/migrations/<ts>_push.sql
supabase db reset            # locally (or `supabase db push` to the cloud)
supabase gen types typescript --local > src/database.types.ts
```

The installer is idempotent via a `sq-<module>:N` version marker (pass `--force` to restamp). Running `add` with no known module lists what's available.

### 2. Deploy the Edge Function

The functions ship in the package under `supabase/functions/`. Copy the one you need into your own project and deploy it:

```bash
# teams:
supabase functions deploy team-invite
# push:
supabase functions deploy send-push
```

### 3. Set the function's secrets

```bash
# teams — reuses your project's auth mail config (§8.9); no extra secret.

# push:
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
supabase secrets set EXPO_ACCESS_TOKEN="<optional>"
```

For push you also generate an FCM VAPID key pair (web) and, optionally, an Expo access token. See [migration plan §8.8 / §8.12](SUPABASE_MIGRATION_PLAN.md) for the full walkthrough.

---

## React Native setup

Import from the `/react-native` entry (native provider, NetInfo adapter, no web devtools):

```ts
import {
  createSupabaseClient,
  createSupabaseQuery,
  reactNativeNetworkAdapter,
} from '@zeroin.earth/supabase-query/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import 'react-native-url-polyfill/auto'

const client = createSupabaseClient<Database>({
  url,
  anonKey,
  authStorage: AsyncStorage, // GoTrue persists the session natively
  isNative: true, // disables URL-based session detection
})
```

> `authStorage` (GoTrue session) and the offline persister storage are **two different concerns** — both use `AsyncStorage` on RN, but they solve different problems. Pass `AsyncStorage` as `storage` to `createOfflineClient` for the query cache.

---

## API reference

Everything is exported from the package root (and `/react-native`). Grouped by module:

- **Client / provider:** `createSupabaseClient`, `createSupabaseQuery`, `SupabaseProvider`, `useSupabase`, `SupabaseContext`
- **TanStack wrappers:** `useQuery`, `useMutation`, `useSuspenseQuery`, `useLazyQuery`, `useQueryClient`
- **Keys / builder / realtime:** `Keys`, `q`, `QueryBuilder`, `subscribeToTable`
- **Data (`db/`):** `useRow(s)`, `useSuspenseRow(s)`, `useInfiniteRows`, `useRowsWithPagination`, `useCreateRow`, `useUpdateRow`, `useUpsertRow`, `useDeleteRow`, `useIncrementColumn`, `useDecrementColumn`, `getRowQuery`, `getRowsQuery`
- **Auth:** `useUser`, `useSession`, `useSignUp`, `useLogin`, `useLogout`, `useOAuthLogin`, `useMagicLink`, `useEmailOtp`, `usePhoneOtp`, `useAnonymousLogin`, `useUpdateUser`, `usePasswordRecovery`, `useResetPassword`, `useVerification`, `useMfa`, `useIdentities`
- **Storage:** `useFiles`, `useFile`, `useCreateFile`, `useUpdateFile`, `useDeleteFile`, `useFileDownload`, `useFileView`, `useFilePreview`, `useSignedUrl`
- **Functions / RPC:** `useFunction`, `useSuspenseFunction`, `useRpc`, `useCallRpc`
- **Teams:** `useTeams`, `useTeam`, `useTeamPrefs`, `useTeamMemberships`, `useTeamMembership`, `useCreateTeam`, `useUpdateTeamName`, `useUpdateTeamPrefs`, `useDeleteTeam`, `useCreateMembership`, `useUpdateMembership`, `useUpdateMembershipStatus`, `useDeleteMembership`, `makeTeamsHooks`
- **Push:** `useDeviceTokens`, `useRegisterDevice`, `useUnregisterDevice`, `useSendPush`, `makePushHooks`
- **Offline:** `createOfflineClient`, `resolveConflict`, `conflictAwareUpdate`, `mutationRegistry`, `webNetworkAdapter` (web), `reactNativeNetworkAdapter` (RN)

Full type exports (variables, results, entities) accompany each module.

---

## Contributing / local dev

```bash
bun install
supabase start            # boots the local stack (DB/Auth/Storage/Realtime/Studio/Inbucket)
bun run gen:types         # snapshot the fixture Database type for tests
bun test                  # bun test + happy-dom against the local stack
bun run lint              # ESLint (flat config) + Prettier
bun run typecheck
bun run build             # tsdown → dist/ (web) + react-native/
```

The integration tests require a running `supabase start` stack.

## License

MIT © Matt Suhay
