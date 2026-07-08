# Migration Plan: `appwrite-graphql` → Supabase React Query hooks

> **Status:** Planning complete, implementation not started.
> **Source repo:** the `appwrite-graphql` repo (`@zeroin.earth/appwrite-graphql`) — read-only reference.
> **Target repo:** **`@zeroin.earth/supabase-query`**, checked out at `~/code/supabase-query`.
>
> This is the single source of truth for the migration. It is written so that **any agent can pick up any phase in a fresh session** with no other context. Read the whole "Orientation" section first, then jump to your phase.

---

## 0. Orientation (read this first, every session)

### What this library is
A React + React Native hooks library that wraps a backend-as-a-service with [`@tanstack/react-query`](https://tanstack.com/query). Its value is **not** the backend binding — it's the layer on top:

- **Offline-first engine** — persisted query cache, paused-mutation queue that replays on reconnect, and three-way conflict resolution.
- **A uniform hook API** — `useQuery`/`useMutation`/`useSuspenseQuery` wrappers, optimistic updates, a fluent type-safe query key factory (`Keys`), a fluent filter builder (`QueryBuilder`), field selection, pagination + infinite scroll.
- **A dual build** — one entry for web (`src/index.ts`) and one for React Native (`src/native-entry.ts`), produced by two `tsup` configs.

The migration **keeps all of that** and **swaps only the backend transport** (Appwrite SDK + Appwrite GraphQL → `@supabase/supabase-js`).

### The one decision that shapes everything: `supabase-js`, not GraphQL
The current library talks to Appwrite's GraphQL endpoint via `gql.tada` typed documents. **Supabase does have a GraphQL API (`pg_graphql`), but we are deliberately NOT using it.** Rationale (this is the "insight" section — read it, don't re-litigate it):

| | `pg_graphql` (GraphQL) | `supabase-js` (PostgREST + friends) ✅ chosen |
|---|---|---|
| Coverage | **Database only.** Auth, Storage, Realtime, Functions are *not* in the GraphQL schema. | One client covers DB, Auth, Storage, Realtime, Functions, RPC. |
| Auth integration | You'd run a second client (`supabase-js`) just for auth, and manually thread its token into the GraphQL client. Split-brain. | Auth token is shared automatically across DB/Storage/Realtime. |
| Realtime | pg_graphql has **no subscriptions**. You'd need `supabase-js` realtime anyway. | First-class `postgres_changes` on the same client. |
| Shape | Relay-style `collection { edges { node } }`, cursor connections, `insertInto…Collection` mutations — every document rewritten anyway, into a *more* awkward shape. | `.from(t).select().eq()`, `.insert()`, `.update()`, `.range()` — maps cleanly onto the existing hook shapes. |
| Ecosystem | Niche. Few examples. | The default path 99% of Supabase apps use. Types via `supabase gen types`. Community + docs all assume it. |

The GraphQL-ness was an **Appwrite transport detail**, never a user-facing feature. Keeping GraphQL would preserve a superficial resemblance while fragmenting the client and buying nothing. So: **drop `gql.tada`, `graphql`, `@graphql-typed-document-node/core`, `src/schema.graphql`, `src/graphql-env.d.ts`. Build the data layer on `supabase-js` v2.**

Typed safety is **not** lost — it moves from hand-written GraphQL documents to a generated `Database` type (`supabase gen types typescript`), which `createClient<Database>()` threads through `.from()`, so `.select()`/`.insert()` are fully typed against your real Postgres schema.

### Ground rules for agents working this migration
1. **Keep the public hook API stable** wherever a Supabase equivalent exists. A consumer swapping `useCollection` → the new `useRows` should mostly change imports and IDs, not rewrite their app. Where semantics *must* change (permissions, transactions), call it out loudly in the doc + JSDoc.
2. **The offline engine is the crown jewel — preserve its behavior.** Only its *backend calls* change, never its control flow (persist → pause → replay → resolve conflict).
3. **After any source/test change, run `bun run lint` and `bun run test`** (this repo's convention; carry it to the new repo). Tests use `bun test` + happy-dom, **not** vitest.
4. **Update the Progress Tracker (§9) at the end of your session** — check off what you finished, leave a one-line handoff note for the next agent.
5. When a phase says "port `X`," it means: copy the file's structure from this repo, keep the hook signature/JSDoc, replace the Appwrite call with the Supabase call per the mapping tables. Don't redesign.

---

## 1. What is kept vs. replaced vs. dropped

### ✅ Kept (backend-agnostic — port almost verbatim)
| Source | Notes |
|---|---|
| `src/useQuery.ts`, `src/useMutation.ts`, `src/useSuspenseQuery.ts`, `src/useLazyQuery.ts`, `src/useQueryClient.ts` | Thin TanStack wrappers. Only the error type (`AppwriteException`) is renamed. |
| `src/offline/network/web.ts`, `src/offline/network/native.ts` | Network adapters. **Zero changes** — they only watch `navigator.onLine` / NetInfo. |
| `src/offline/conflictResolution/resolve.ts` + `types.ts` | Conflict strategies (`last-write-wins`, `server-wins`, `merge-shallow`, custom fn). Pure logic, **zero changes**. |
| `src/offline/createOfflineClient.ts` | Keep control flow; swap `createAppwriteClient` → `createSupabaseClient` and re-point the registry import. |
| `src/AppwriteProvider.tsx` / `src/AppwriteProviderNative.tsx` | Rename → `SupabaseProvider`. Persist/rehydrate logic unchanged. |
| `src/context.ts`, `src/useAppwrite.ts` | Rename → `SupabaseContext` / `useSupabase`. |
| `src/query/Keys.ts` | Keep the fluent builder mechanism. **Rename** the resource verbs (see §4). |
| Build tooling: `tsup.config.ts`, `tsup.native.config.ts`, `post-build.js`, `eslint.config.mjs`, `.prettierrc`, `bunfig.toml`, `tsconfig.json` | Port as-is; drop the gql.tada ESLint/TS plugin bits. |
| Test harness: `tests/setup/*`, happy-dom registrator, `tests/__mocks__/Realtime.ts` (rewrite the mock body for the Supabase channel API) | Keep the structure; the Appwrite docker-compose is replaced by the Supabase CLI local stack (see §8). |

### 🔄 Replaced (rewrite against `supabase-js`)
| Source | Target | Section |
|---|---|---|
| `src/client.ts` (`createAppwriteClient`) | `createSupabaseClient` wrapping `createClient<Database>()` | §3 |
| `src/types.ts` (Appwrite re-exports) | Supabase types + generated `Database` type | §3 |
| `src/query/QueryBuilder.ts` | PostgREST filter builder (serializable descriptor) | §5 |
| `src/databases/**` **and** `src/tablesDB/**` | **Collapse into one `src/db/**` module** (Postgres has one table API, not two) | §6 |
| `src/account/**` (~60 files) | `src/auth/**` on `supabase.auth` (GoTrue) | §7 |
| `src/storage/**` | `src/storage/**` on `supabase.storage` | §6 |
| `src/functions/**` | `src/functions/**` on `supabase.functions.invoke` / `.rpc` | §6 |
| Realtime (`Channel.tablesdb(...)` inside hooks) | `supabase.channel().on('postgres_changes', …)` helper | §5 |
| `src/offline/mutations/registry.ts` | Re-point every entry to the new Supabase mutation fns | §6 |
| `src/offline/mutations/conflictAwareUpdate.ts` | Swap the GraphQL fetch/update for `supabase.from().select()/.update()` | §6 |

### ❌ Dropped (no Supabase equivalent — remove, document the removal)
| Source | Why | Replacement guidance for consumers |
|---|---|---|
| `src/locale/**` | Appwrite Locale (geo/countries/currencies/languages) has no Supabase analog. | Ship static data or a 3rd-party lib (`i18n-iso-countries`, `world-countries`). Out of scope. |
| `src/avatars/**` | Appwrite Avatars (initials, QR, flags, favicons, credit-card icons). | DiceBear for avatars, a QR lib (`qrcode`) client-side. Out of scope. |
| `src/messaging/**` (subscribers/topics) | Appwrite Messaging's subscriber/topic model has no Supabase analog. | **Replaced by a new `push/` module + `send-push` Edge Function** (see §6.6 + §8.12) — this is the Firebase/FCM push replacement you need, kept but redesigned, not dropped. |
| `src/account/useCreatePushTarget.ts`, `useUpdatePushTarget.ts`, `useDeletePushTarget.ts` | Appwrite push targets — no GoTrue analog. | **Folded into the new `push/` module** as `device_tokens`-table hooks (register/unregister). |
| `src/account/useLogs.ts` | Appwrite account activity logs — no client-side GoTrue analog. | `auth.admin` is server-only; expose via an Edge Function if needed. |
| `src/schema.graphql`, `src/graphql-env.d.ts` | GraphQL transport artifacts. | Replaced by generated `Database` type. |
| The **transactions** hooks (`useCreateTransaction`, `useListTransactions`, staged operations, in both `databases/` and `tablesDB/`) | Appwrite's staged-transaction API has no PostgREST equivalent. | Model atomic multi-step ops as **Postgres RPC functions** (run inside a real DB transaction). See §6.4 + §8.7. |

> **Owner-confirmed (§10):** drop locale / avatars / logs; collapse the two DB APIs into one; **keep teams (v1)**; **keep PostGIS geo QueryBuilder methods**; **replace messaging with a push module** (Expo native + FCM web) rather than dropping it.

---

## 2. Conceptual mapping: Appwrite → Supabase

Keep this table open while porting.

| Concept | Appwrite | Supabase | Notes / gotcha |
|---|---|---|---|
| Data model | Databases → Collections → Documents **and** TablesDB → Tables → Rows | Postgres schema → Tables → Rows | **Two APIs collapse to one.** New key hierarchy: `schema → table → row`. |
| Read one | `databasesGetDocument` | `.from(t).select().eq('id', id).single()` | |
| Read many | `databasesListDocuments` `{ total, documents }` | `.from(t).select('*', { count: 'exact' })` → `{ data, count }` | Ask for `count: 'exact'` to keep the `total` accessor. |
| Field selection | `Query.select([...])` | `.select('col_a, col_b, rel(*)')` | PostgREST select string; also does joins. |
| Filters | `Query.equal/greaterThan/...` → `string[]` | `.eq()/.gt()/.in()/.or()/.contains()/.textSearch()` | See QueryBuilder §5. |
| Create | `tablesDBCreateRow(data, rowId)` | `.from(t).insert(row).select().single()` | No client-supplied ID needed; use DB `default gen_random_uuid()`. |
| Update | `...UpdateDocument(data)` | `.from(t).update(patch).eq('id', id).select().single()` | Partial patch, same as before. |
| Upsert | `...UpsertDocument` | `.from(t).upsert(row, { onConflict: 'id' }).select().single()` | |
| Delete | `...DeleteDocument` | `.from(t).delete().eq('id', id)` | |
| Increment/decrement | `...Increment/DecrementDocumentAttribute` | `.rpc('increment', { … })` | Needs a SQL function (§8.7). PostgREST can't do `col = col + 1` directly. |
| Pagination (offset) | `Query.limit` + `Query.offset` | `.range(from, to)` (inclusive) | |
| Pagination (cursor/infinite) | `Query.cursorAfter(id)` | keyset: `.gt('id', cursor).order('id').limit(n)` | Prefer keyset for infinite scroll. |
| **Permissions** | Per-document permission strings `read("user:x")` passed to every write | **Row Level Security policies** on the table | **Biggest shift.** The `permissions` argument is REMOVED from hooks. Access = policies (§8.4). |
| Realtime | `Channel.tablesdb(db).table(t).row()` + `response.events`/`payload` | `supabase.channel(name).on('postgres_changes', { event, schema, table, filter }, cb)` | `payload.eventType` ∈ INSERT/UPDATE/DELETE; `payload.new`/`payload.old`. Requires publication + RLS (§8.5). |
| Auth: email/password | `accountCreateEmailPasswordSession` | `auth.signInWithPassword({ email, password })` | |
| Auth: signup | `accountCreate` | `auth.signUp({ email, password, options: { data } })` | `data` → `user_metadata`. |
| Auth: OAuth | `account.createOAuth2Session({ provider, success, failure })` | `auth.signInWithOAuth({ provider, options: { redirectTo } })` | Provider is a lowercase string (`'google'`), not an enum. |
| Auth: magic link | `accountCreateMagicURLToken` | `auth.signInWithOtp({ email, options: { emailRedirectTo } })` | |
| Auth: email/phone OTP | `accountCreateEmailToken`/`PhoneToken` + update | `auth.signInWithOtp({ email\|phone })` then `auth.verifyOtp({ …, token, type })` | |
| Auth: anonymous | `accountCreateAnonymousSession` | `auth.signInAnonymously()` | Enable in dashboard. |
| Auth: current user | `accountGet` | `auth.getUser()` | `getSession()` for the token; `onAuthStateChange` to react. |
| Auth: update name/prefs | `accountUpdateName` / `accountUpdatePrefs` | `auth.updateUser({ data: { … } })` | No separate name/prefs — it's all `user_metadata`. |
| Auth: update email/password/phone | `accountUpdateEmail/Password/Phone` | `auth.updateUser({ email\|password\|phone })` | |
| Auth: recovery | `accountCreateRecovery` + update | `auth.resetPasswordForEmail(email, { redirectTo })` → then `auth.updateUser({ password })` | |
| Auth: verification | `accountCreateVerification` + update | `auth.verifyOtp({ type: 'signup'\|'email_change', … })` / `auth.resend()` | |
| Auth: MFA | `accountCreateMfaAuthenticator`/`Challenge`/… | `auth.mfa.enroll/challenge/verify/unenroll/listFactors/getAuthenticatorAssuranceLevel` | Maps closely. |
| Auth: identities | `accountListIdentities`/`deleteIdentity` | `auth.getUserIdentities()` / `auth.linkIdentity()` / `auth.unlinkIdentity()` | |
| Auth: sessions list | `accountListSessions` | ⚠️ **No client API to list all sessions.** `getSession()` returns only the current one; listing is `auth.admin` (server-only). | Drop `useListSessions`/`useGetSession(id)` or back them with an Edge Function. |
| Auth: JWT | `accountCreateJWT` | `(await auth.getSession()).data.session?.access_token` | No separate mint step. |
| Teams | Appwrite Teams + memberships (first-class) | ❌ **No primitive.** Model as `teams` + `team_members` tables + RLS + helper RPCs. | Optional module. SQL in §8.8. |
| Storage | Buckets → Files | `supabase.storage.from(bucket)` → objects | `.upload/.download/.remove/.list/.getPublicUrl/.createSignedUrl`. |
| File preview/view/URL | `storageGetFilePreview` etc. | `.getPublicUrl(path)` (public buckets) / `.createSignedUrl(path, expiresIn)` (private) | Image transforms via `getPublicUrl(path, { transform })`. |
| Functions | `functionsCreateExecution` + list/get executions | `supabase.functions.invoke(name, { body })` | Listing executions has **no** client analog — drop `useListExecutions`/`useGetExecution`. |

---

## 3. Target repo structure

```
supabase-query/
├── src/
│   ├── index.ts                 # web entry  (was src/index.ts)
│   ├── index.shared.ts          # shared exports
│   ├── native-entry.ts          # RN entry
│   ├── client.ts                # createSupabaseClient  ← REWRITE
│   ├── types.ts                 # Supabase + generated Database type  ← REWRITE
│   ├── context.ts               # SupabaseContext  (renamed)
│   ├── useSupabase.ts           # (was useAppwrite.ts)
│   ├── SupabaseProvider.tsx     # (renamed)
│   ├── SupabaseProviderNative.tsx
│   ├── useQuery.ts / useMutation.ts / useSuspenseQuery.ts / useLazyQuery.ts / useQueryClient.ts   # port ~verbatim
│   ├── query/
│   │   ├── Keys.ts              # renamed verbs (schema/table/row)  ← EDIT
│   │   └── QueryBuilder.ts      # PostgREST filter descriptor  ← REWRITE
│   ├── db/                      # merged databases/ + tablesDB/  ← REWRITE
│   │   ├── queryOptions.ts
│   │   ├── useRow.ts / useRows.ts / useInfiniteRows.ts / useRowsWithPagination.ts
│   │   ├── useCreateRow.ts / useUpdateRow.ts / useUpsertRow.ts / useDeleteRow.ts
│   │   ├── useIncrementColumn.ts / useDecrementColumn.ts   # via RPC
│   │   ├── realtime.ts         # postgres_changes helper
│   │   ├── types.ts
│   │   └── index.ts
│   ├── auth/                    # was account/  ← REWRITE
│   │   ├── useUser.ts / useSession.ts / useSignUp.ts / useLogin.ts / useLogout.ts
│   │   ├── useUpdateUser.ts / usePasswordRecovery.ts / useResetPassword.ts
│   │   ├── useVerification.ts / useMfa*.ts / useIdentities.ts / useOAuth.ts
│   │   ├── queryOptions.ts / index.ts
│   ├── storage/                 # ← REWRITE
│   ├── functions/               # ← REWRITE (invoke + rpc)
│   ├── teams/                   # v1, custom-table backed  ← REWRITE
│   ├── push/                    # NEW — replaces messaging (device tokens + send)
│   │   ├── useRegisterDevice.ts / useUnregisterDevice.ts   # device_tokens table
│   │   ├── useSendPush.ts       # invokes the send-push Edge Function
│   │   ├── types.ts / index.ts
│   └── offline/                 # ← PORT (registry + conflictAwareUpdate edited)
│       ├── createOfflineClient.ts
│       ├── conflictResolution/{resolve.ts,types.ts}   # verbatim
│       ├── mutations/{registry.ts,conflictAwareUpdate.ts}   # EDIT
│       └── network/{web.ts,native.ts}                 # verbatim
├── tests/                       # mirror src/, happy-dom, bun test
├── supabase/                    # Supabase CLI project (migrations, config, functions)  ← NEW, user-owned
│   ├── config.toml
│   ├── migrations/*.sql
│   └── functions/send-push/     # Edge Function: Expo Push (native) + FCM v1 (web)
├── tsup.config.ts / tsup.native.config.ts / post-build.js
├── package.json / tsconfig.json / eslint.config.mjs / .prettierrc
└── README.md
```

### `package.json` deltas
**Remove:** `appwrite`, `node-appwrite`, `react-native-appwrite`, `gql.tada`, `graphql`, `@graphql-typed-document-node/core`, `otpauth`/`mailpit-api` (Appwrite test helpers — replace with Supabase-local equivalents).
**Add:**
- `@supabase/supabase-js` (peer + dev) — the core client.
- `@supabase/ssr` (optional peer) — only if you support Next.js/SSR cookie auth.
- **React Native peers:** `@react-native-async-storage/async-storage` (already present — reused for auth session storage *and* the offline persister), `react-native-url-polyfill` (required: supabase-js needs a URL polyfill on RN), `@react-native-community/netinfo` (already present).
- Keep all `@tanstack/*` deps unchanged — the offline stack is identical.

### The library is schema-generic — it ships NO `Database` type
This is a **reusable library** consumed by many apps, so it must never bind to one project's schema. It is generic over the *consumer's* generated `Database` type. The role gql.tada played in the Appwrite version — schema-driven autocomplete over typed documents — is now played by the consumer's `supabase gen types` output threaded through generics. **No real Supabase project (cloud or local) is needed to build or type-check the library.** A live backend is required only for the library's own integration tests (P4), and that is a *local* `supabase start` stack with a fixture schema committed under `supabase/` in this repo — self-contained, not tied to any consumer project.

### Typing DX — DECIDED: the factory pattern (`createSupabaseQuery<Database>()`)
Consumers call the factory **once** with their generated `Database` type and receive fully-typed hooks: table names autocomplete, row types infer, filters are checked against real columns. They never hand-write `<Row>` generics — this is the direct successor to the gql.tada autocomplete the Appwrite library had.
```ts
// once per app
export const { SupabaseProvider, useRow, useRows, useCreateRow, /* … */ } =
  createSupabaseQuery<Database>()

// in components — 'todos' autocompletes; row type is inferred, no generic passed
const { row }  = useRow('todos', id)                          // row  ?: Todo
const { rows } = useRows('todos', (q) => q.eq('done', false)) // rows ?: Todo[]
```
**Implementation:** one module-level React context holds a loosely-typed `SupabaseClient<any>`; the factory returns thin hook wrappers bound to `Database` that re-type inputs/outputs by table name (`Database['public']['Tables'][T]['Row']`). So **P1 (client/context/provider) is identical either way** — all the typing lives in the P4+ hook wrappers the factory returns.

### `createSupabaseClient` (sketch for P1)
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Generic over the consumer's Database; permissive default so the library
// builds and runs untyped. Inference comes from the factory above, not here.
export function createSupabaseClient<Database = any>({
  url,
  anonKey,
  authStorage,        // RN: pass AsyncStorage so GoTrue persists the session natively
  isNative = false,
}: {
  url: string
  anonKey: string
  authStorage?: { getItem; setItem; removeItem }
  isNative?: boolean
}) {
  const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
    auth: {
      storage: authStorage,            // undefined on web → localStorage
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: !isNative,   // false on RN
    },
  })
  return { supabase }
}
// Consumers may also build their own typed client and pass it to the provider.
export type SupabaseHooksClient<Database = any> = { supabase: SupabaseClient<Database> }
```
> **Insight:** unlike Appwrite (many service objects), Supabase is *one* client exposing `.from`, `.auth`, `.storage`, `.realtime`, `.functions`, `.rpc`. The context value is just `{ supabase }`. GoTrue manages its **own** session storage — separate from the TanStack offline persister (which caches query results). On React Native you must pass `AsyncStorage` as `auth.storage` **and** as the offline persister storage; two different concerns.

---

## 4. `Keys.ts` rename map (Phase 3)

Keep the class mechanism verbatim. Rename resource verbs so keys read in Postgres terms and the two old DB hierarchies unify:

| Old (Appwrite) | New (Supabase) |
|---|---|
| `Keys.databases()` / `Keys.database(id)` + `Keys.tablesDBs()` / `Keys.tablesDB(id)` | `Keys.schema(name='public')` (single hierarchy) |
| `.collection(id)` / `.collections()` + `.table(id)` | `.table(name)` / `.tables()` |
| `.document(id)` / `.documents()` + `.row(id)` / `.rows()` | `.row(id)` / `.rows()` |
| `.account()` | `.auth()` |
| `.transactions()` / `.operations()` | **removed** (no staged transactions) |
| `.locale()` / `.messaging()` | **removed** |
| `.buckets()` / `.bucket(id)` / `.files()` / `.file(id)` | keep (storage) |
| `.functions()` / `.function(id)` / `.executions()` | keep `.function(name)`; drop `.executions()` |
| `.teams()` / `.team(id)` / `.memberships()` | keep (custom-table teams module) |
| `.create()/.update()/.upsert()/.delete()/.key()` leaves | keep unchanged |

The root key literal `'appwrite'` → `'supabase'`, and the offline scope `{ id: 'appwrite' }` → `{ id: 'supabase' }` (in `registry.ts`).

---

## 5. QueryBuilder & Realtime (Phase 4)

### QueryBuilder — the important design decision
Appwrite's builder produced a `string[]` that was both sent to the API **and** embedded in the query key (so the key stayed stable/serializable). PostgREST filters are applied by **chaining methods on the query object**, which is not serializable. To preserve stable query keys, the new builder must produce a **serializable descriptor** that is (a) hashed into the query key and (b) *replayed* onto a `PostgrestFilterBuilder`:

```ts
type FilterOp = { fn: 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'like'|'ilike'|'is'
                    |'in'|'contains'|'containedBy'|'textSearch'|'or'|'not', args: unknown[] }
type ModifierOp = { fn: 'order'|'limit'|'range'|'select', args: unknown[] }

class QueryBuilder<T> {
  private ops: (FilterOp | ModifierOp)[] = []
  eq<K extends keyof T & string>(col: K, v: T[K]) { this.ops.push({ fn:'eq', args:[col,v] }); return this }
  gt(...) { … }  order(...) { … }  limit(...) { … }  range(...) { … }
  // …one method per PostgREST filter, mirroring the old fluent surface…
  build(): (FilterOp|ModifierOp)[] { return [...this.ops] }              // → goes into the query key
  applyTo(q: PostgrestFilterBuilder<any,any,any>) {                       // → replays onto supabase-js
    return this.ops.reduce((acc, op) => (acc as any)[op.fn](...op.args), q)
  }
}
export const q = <T extends Record<string, unknown>>() => new QueryBuilder<T>()
```

**Mapping the old methods → PostgREST:** `equal→eq`, `notEqual→neq`, `lessThan→lt`, `greaterThan→gt`, `lessThanEqual→lte`, `greaterThanEqual→gte`, `search→textSearch` (or `ilike`), `startsWith→like('v%')`, `contains→contains` (jsonb/array), `isNull→is(col,null)`, `orderAsc/Desc→order(col,{ascending})`, `limit→limit`, `offset→range`, `select→.select(string)`, `or→or('a.eq.x,b.eq.y')`, `between→gte + lte`, `cursorAfter→gt(col, cursor) + order`.

**Geo methods — KEEP (PostGIS is enabled).** The `distance*` / `intersects` / `crosses` / `overlaps` / `touches` methods map to PostGIS spatial predicates, which PostgREST can't express as chained filters. Two viable implementations — pick per method:
- **RPC-backed** (recommended for `distance*` radius search): install a SQL function using `ST_DWithin`/`ST_Distance` on a `geography`/`geometry` column and call it via `.rpc('within_distance', { lat, lng, meters })`. The QueryBuilder's geo methods should record a descriptor that the `db/` layer routes to the RPC instead of `.from().select()`.
- **PostgREST filter on a computed/`tsvector`-style expression** where a plain operator suffices. For true spatial ops, prefer the RPC path.

Provide a `supabase/migrations` example with a `geography(Point,4326)` column + GiST index (`create index … using gist (location)`), and the matching RPC (§8.7 pattern). Keep the fluent method signatures identical to the Appwrite versions so consumer call-sites don't change.

### Realtime helper (`src/db/realtime.ts`)
Replace the inlined `Channel.tablesdb(...)` subscriptions in the read hooks with one shared helper that mirrors the old `useCollectionRealtime` control flow (setQueryData on the row key + invalidate the list key):

```ts
export function subscribeToTable(supabase, { schema='public', table, filter }, onChange) {
  const channel = supabase
    .channel(`realtime:${schema}:${table}:${filter ?? '*'}`)
    .on('postgres_changes', { event: '*', schema, table, filter }, (payload) => {
      // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      // payload.new (INSERT/UPDATE), payload.old (UPDATE/DELETE — needs REPLICA IDENTITY FULL)
      onChange(payload)
    })
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
```
Wire it in `useRows`/`useRow`/`useInfiniteRows` exactly where `useCollectionRealtime` was, keeping the `subscribe = true` default. **`filter`** uses PostgREST syntax, e.g. `` `user_id=eq.${userId}` ``.

> **Gotchas to encode in JSDoc:** (1) the table must be in the `supabase_realtime` publication; (2) RLS is enforced on realtime — the subscribed user must be allowed to `SELECT` the rows; (3) `UPDATE`/`DELETE` only include `payload.old` columns if the table has `REPLICA IDENTITY FULL`. All three are manual steps (§8.5).

---

## 6. Data / Storage / Functions / Offline porting notes

### 6.1 `db/` module (merge of `databases/` + `tablesDB/`)
- One module, `row`/`table` vocabulary. Where the old repo had both `useDocument` and `useRow`, ship one `useRow`. Same for lists (`useRows`), infinite (`useInfiniteRows`), paginated (`useRowsWithPagination`).
- `queryOptions.ts`: `queryFn` becomes `await supabase.from(table).select(sel, { count:'exact' }).…`; unwrap `{ data, error, count }`, `throw error` on error, return `{ total: count ?? 0, rows: data }`. Single-row read uses `.single()`.
- **No more `JSON.parse(document.data)`** — Appwrite stored custom fields inside a `data` JSON string; Postgres columns are first-class. Delete all the `JSON.stringify`/`JSON.parse` of `data`, and the `_id`→`$id` juggling. Rows are plain typed objects with an `id` column.
- Optimistic create/update/delete: keep the exact `onMutate`/`onError`/`onSettled` rollback structure from `useUpdateDocument.ts` / `useCreateRow.ts`; only the `mutationFn` body changes to a supabase call. Preserve `baseSnapshot` capture — the offline conflict engine depends on it.

### 6.2 `storage/`
Map each hook: `useFiles→.list()`, `useFile→.list`/metadata, `useCreateFile→.upload()`, `useDeleteFile→.remove()`, `useUpdateFile→.update()`, `useFileDownload→.download()`, `useFilePreview`/`useFileView→.getPublicUrl()` or `.createSignedUrl()`. Buckets are created by the user (§8.6), not at runtime.

### 6.3 `functions/`
`useFunction` (execute) → `supabase.functions.invoke(name, { body })`. **Drop** `useListExecutions` / `useGetExecution` (no client API). Add a thin `useRpc`/`useCallRpc` for `supabase.rpc(name, args)` since RPC replaces transactions + increment/decrement.

### 6.4 Increment/decrement & "transactions"
PostgREST cannot express `col = col + n`. Provide it as an RPC the user installs (§8.7):
```ts
// useIncrementColumn.ts
mutationFn: async ({ table, id, column, amount }) =>
  supabase.rpc('increment_column', { p_table: table, p_id: id, p_column: column, p_amount: amount })
```
Atomic multi-step work that used Appwrite staged transactions → a bespoke Postgres function per use case, invoked via `.rpc()`. Document this pattern; don't try to emulate a generic transaction API over PostgREST.

### 6.5 Offline engine edits (the only two files that change)
- **`offline/mutations/registry.ts`:** replace `gqlMutation(...)` factory with a `supabaseMutation(...)` factory that runs a supabase call and returns the row. Re-point each `mutationKey` to the new `Keys` verbs. Remove the messaging entries; remove the account-prefs/name/email/etc. entries that no longer route through the DB (auth updates go through GoTrue, which is **online-only** — see note). Keep the row create/update/upsert/delete/increment/decrement entries and the team entries (if teams kept). Change `scope.id` to `'supabase'`.
- **`offline/mutations/conflictAwareUpdate.ts`:** swap the two backend calls — remote fetch `client.graphql.query(getDocument)` → `supabase.from(table).select().eq('id', id).single()`; the write `client.graphql.mutation(updateDocument)` → `supabase.from(table).update(resolved).eq('id', id).select().single()`. The three-way merge (`resolveConflict`) and cache-write logic stay identical. Drop the `JSON.parse(rawRemote.data)` unwrap — remote is already a plain row.

> **Offline scope insight:** Appwrite auth mutations were offline-queueable because they were just GraphQL calls. GoTrue auth (login, updateUser, MFA) is **inherently online** (it mints/refreshes tokens server-side). Keep auth mutations on `networkMode: 'online'` and **out** of the offline replay registry. Only *data* mutations (rows) and *teams* rows belong in the offline queue. Call this out in the README so users don't expect offline login.

### 6.6 `push/` module — the messaging/Firebase replacement (Phase 9b)
Replaces Appwrite Messaging + push targets. Two halves: **client-side token registration** (in the library) and a **server-side sender** (an Edge Function, since sending requires provider secrets that must never reach the client). Targets **both** transports, branching by platform:

- **Native (iOS/Android)** → **Expo Push API** (`https://exp.host/--/api/v2/push/send`). Expo fans out to APNs + FCM, so no APNs certs / service accounts needed for native.
- **Web (browsers)** → **FCM HTTP v1** (`https://fcm.googleapis.com/v1/projects/<id>/messages:send`) with a service-account JWT.

**Data model** (migration in §8.12):
```sql
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  provider text not null check (provider in ('expo','fcm')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
-- RLS: a user manages only their own tokens
alter table public.device_tokens enable row level security;
create policy "own tokens" on public.device_tokens
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Client hooks** (`src/push/`):
- `useRegisterDevice()` — upsert `{ token, platform, provider }` into `device_tokens` (call after login + on token refresh). Native token via `expo-notifications` `getExpoPushTokenAsync()` (provider `'expo'`); web token via Firebase `getToken()` (provider `'fcm'`). The *library* takes the token as input; acquiring it is the app's job (peer concern) — document it, don't bundle `expo-notifications`/`firebase` as hard deps.
- `useUnregisterDevice()` — delete the row (call on logout).
- `useSendPush()` — thin wrapper over `supabase.functions.invoke('send-push', { body: { userIds, title, body, data } })`. Optional; most sends happen server-to-server, but expose it for authorized in-app sends.

**Edge Function `send-push`** (`supabase/functions/send-push/`, Deno):
1. Auth: verify the caller (or a service-role secret for server-to-server); authorize who may push to whom.
2. Look up `device_tokens` for the target `userIds` (use the service-role client to bypass RLS server-side).
3. **Branch by `provider`:** batch `expo` tokens → Expo Push API; `fcm` tokens → FCM v1 (mint a short-lived JWT from the `FCM_SERVICE_ACCOUNT` secret).
4. Handle receipts: prune tokens Expo/FCM report as `DeviceNotRegistered`/`UNREGISTERED` (delete from `device_tokens`).

> **Insight:** push send-logic lives server-side on purpose — Expo works keyless, but FCM v1 needs a service-account private key that cannot ship in a client bundle. The library only ever touches the `device_tokens` table (fully RLS-guarded) and *invokes* the function; all secrets stay in Edge Function env vars (§8.12).

---

## 7. Auth module strategy (Phase 6 — largest surface)

The old `account/` has ~60 files; GoTrue is smaller and more orthogonal, so **consolidate**. Suggested hooks and their GoTrue calls (full mapping in §2):

- `useUser()` — query wrapping `auth.getUser()`, invalidated by an `onAuthStateChange` subscription set up in the provider (push new session into the query cache). This replaces `useAccount`.
- `useSession()` — `auth.getSession()`.
- `useSignUp()` / `useLogin()` / `useLogout()` — `signUp` / `signInWithPassword` / `signOut`.
- `useOAuthLogin()` — `signInWithOAuth`. `useMagicLink()` / `useEmailOtp()` / `usePhoneOtp()` — `signInWithOtp` + `verifyOtp`. `useAnonymousLogin()` — `signInAnonymously`.
- `useUpdateUser()` — one hook for email/password/phone/metadata (collapses `useUpdateName`/`Email`/`Password`/`Phone`/`Prefs`).
- `usePasswordRecovery()` / `useResetPassword()` — `resetPasswordForEmail` → `updateUser({ password })`.
- `useVerification()` — `verifyOtp` / `resend`.
- `useMfa()` — wraps `auth.mfa.*` (enroll/challenge/verify/unenroll/listFactors).
- `useIdentities()` — `getUserIdentities` / `linkIdentity` / `unlinkIdentity`.

**Drop:** `useListSessions`, `useGetSession(id)`, `useDeleteSessions` (multi-session is admin-only — note the gap), push targets, logs, `useUpdateStatus` (admin-only).

**Provider addition:** in `SupabaseProvider`, subscribe to `supabase.auth.onAuthStateChange((event, session) => { queryClient.setQueryData(Keys.auth().key(), session?.user ?? null); if (event==='SIGNED_OUT') queryClient.clear() })`. This keeps `useUser` reactive without polling — a genuine upgrade over the Appwrite flow.

---

## 8. Manual steps for the repo owner (you)

These are the things an agent **cannot** do for you — they need dashboard access, secrets, or DB design decisions. Do them roughly in order. Each agent phase that depends on one is noted.

### 8.1 — Create the Supabase project
1. Go to <https://supabase.com/dashboard> → **New project**. Pick an org, name, DB password (save it), region close to your users.
2. Wait for provisioning (~2 min).
3. **Project Settings → API**: copy **Project URL** and the **`anon` public key**. These are the `url` + `anonKey` for `createSupabaseClient`. (The `service_role` key is server-only — never ship it in the client.)
4. Put them in `.env` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or your framework's public-var convention).

### 8.2 — Install the Supabase CLI + init local dev
```bash
brew install supabase/tap/supabase      # or: npm i -g supabase
cd <new-repo>
supabase init                            # creates supabase/ (config.toml, migrations/)
supabase login                           # opens browser
supabase link --project-ref <ref>        # <ref> from the dashboard URL
supabase start                           # boots the FULL stack locally in Docker (DB, Auth, Storage, Realtime, Studio)
```
`supabase start` prints a local **API URL** and **anon key** — use those for tests and local dev (this replaces the old `tests/docker-compose.yml` Appwrite stack). `supabase stop` to shut down. Studio UI is at the printed URL.

### 8.3 — Design & create your schema (migrations)
Translate each Appwrite collection into a Postgres table. Create a migration:
```bash
supabase migration new init_schema
```
Edit the generated `supabase/migrations/<ts>_init_schema.sql`. Example (a `todos` collection → table):
```sql
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- keep updated_at fresh
create trigger set_updated_at before update on public.todos
  for each row execute function extensions.moddatetime (updated_at);
```
Apply locally with `supabase db reset` (re-runs all migrations), and to the cloud with `supabase db push`.
> **Design notes:** use `uuid` PKs with `default gen_random_uuid()` so clients don't supply IDs. Add `created_at`/`updated_at`. Model Appwrite "relationships" as real FKs and query them with PostgREST embeds (`.select('*, author(*)')`).

### 8.4 — Enable Row Level Security (this replaces Appwrite permissions)
**This is the single most important conceptual change.** Appwrite attached permission strings to each document; Supabase enforces access with SQL policies per table. For every table:
```sql
alter table public.todos enable row level security;

create policy "select own" on public.todos
  for select using (auth.uid() = user_id);
create policy "insert own" on public.todos
  for insert with check (auth.uid() = user_id);
create policy "update own" on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.todos
  for delete using (auth.uid() = user_id);
```
Without RLS enabled, the `anon`/`authenticated` roles can read/write everything — enable it on **every** table. The client hooks no longer pass `permissions`; the DB decides. Test policies in Studio's SQL editor with `set role authenticated` / `set request.jwt.claims`.

### 8.5 — Turn on Realtime for the tables that need it
```sql
-- add the table to the realtime publication
alter publication supabase_realtime add table public.todos;
-- include full old-row data on UPDATE/DELETE realtime payloads
alter table public.todos replica identity full;
```
(Or toggle Realtime per-table in **Studio → Database → Replication**.) RLS still applies to realtime — a client only receives changes to rows it can `SELECT`.

### 8.6 — Create Storage buckets + policies
In **Studio → Storage** (or SQL), create each bucket (public vs private). For private buckets, add storage RLS policies, e.g.:
```sql
create policy "read own files" on storage.objects
  for select using (bucket_id = 'avatars' and owner = auth.uid());
```
Note which buckets are public (served via `getPublicUrl`) vs private (`createSignedUrl`).

### 8.7 — Install helper RPC functions (increment + any atomic ops)
```sql
create or replace function public.increment_column(
  p_table text, p_id uuid, p_column text, p_amount int
) returns void language plpgsql security definer as $$
begin
  execute format('update public.%I set %I = %I + $1 where id = $2', p_table, p_column, p_column)
    using p_amount, p_id;
end; $$;
```
(Prefer a **typed, per-table** RPC over the dynamic one above if you want RLS to apply cleanly — `security definer` bypasses RLS, so add your own checks.) Add one bespoke RPC per atomic multi-step operation you previously did with Appwrite transactions.

**PostGIS geo RPCs (you have PostGIS enabled).** Enable the extension and back the QueryBuilder's `distance*` methods (§5) with spatial RPCs:
```sql
create extension if not exists postgis;

-- example spatial column + index on a table
alter table public.places add column location geography(Point, 4326);
create index places_location_gix on public.places using gist (location);

-- radius search RPC the QueryBuilder's distanceLessThan() routes to
create or replace function public.places_within(
  p_lat float8, p_lng float8, p_meters float8
) returns setof public.places language sql stable as $$
  select * from public.places
  where st_dwithin(location, st_makepoint(p_lng, p_lat)::geography, p_meters);
$$;
```
RLS on `places` still applies because this RPC is `stable`/`security invoker` (not `definer`). Add one RPC per spatial predicate you actually use; keep the QueryBuilder method names identical so call-sites don't change.

### 8.8 — Teams: tables + policies + helper RPCs (v1)
Supabase has no teams primitive, so the `teams/` module is backed by these tables + RPCs:
```sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create type team_role as enum ('owner','admin','member');
create table public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role team_role not null default 'member',
  status text not null default 'active',
  primary key (team_id, user_id)
);
-- membership-based RLS: you can see a team if you're a member
create policy "members read team" on public.teams for select
  using (exists (select 1 from public.team_members m
                 where m.team_id = id and m.user_id = auth.uid()));
```
Add RPCs for `create_team` (insert team + owner membership atomically), `invite_member`, etc. The `teams/` hooks then call `.from('teams'/'team_members')` and these RPCs.
> **RLS recursion gotcha:** a policy on `teams` that queries `team_members`, and a policy on `team_members` that queries `teams`, can recurse. Break the cycle with a `security definer` helper like `is_team_member(team_id, user_id) returns boolean` and call *that* from the policies.

### 8.9 — Configure Auth providers & email
In **Studio → Authentication**:
1. **Providers:** enable Email; enable each OAuth provider you use (Google, Apple, …) — each needs a client ID/secret from that provider's console and the Supabase callback URL.
2. **URL Configuration:** set **Site URL** and **Redirect URLs** (must include your app's deep link / web callback, and Expo dev URLs for RN). `signInWithOAuth`/magic-link `redirectTo` must be in this allow-list.
3. **Anonymous sign-ins:** enable if you use `signInAnonymously`.
4. **Email templates:** customize confirm/recovery/magic-link emails. Locally, `supabase start` runs **Inbucket** (printed URL) to catch test emails — this replaces the old Mailpit setup in `tests/`.
5. **MFA:** enable TOTP if you use the MFA hooks.

### 8.10 — Generate TypeScript types
After every schema change:
```bash
# from local stack:
supabase gen types typescript --local > src/database.types.ts
# or from cloud:
supabase gen types typescript --project-id <ref> > src/database.types.ts
```
**Where this file lives:** in each **consuming app**, feeding `createSupabaseQuery<Database>()`. The library itself ships **no** schema types (it's generic). For *this repo*, run the same command against the **local test stack** to snapshot a fixture `Database` type under `tests/` for the P4 integration suite — that is the only `Database` type in the library repo, and it's a test fixture, not published.

### 8.11 — (If needed) Edge Functions
For anything that needs a secret or server logic (custom transactions callable from client, admin-only queries, etc.):
```bash
supabase functions new my-func
supabase functions serve        # local
supabase functions deploy my-func
```
Call from the client with `supabase.functions.invoke('my-func', { body })`.

### 8.12 — Push notifications setup (replaces Appwrite Messaging/Firebase)
This is the messaging replacement. Three parts:

**a) `device_tokens` table + RLS** — apply the migration from §6.6.

**b) Provider credentials (stored as Edge Function secrets, never in the client):**
- **Expo (native):** no key needed to send to Expo push tokens. If you use Expo's enhanced security, create an **Expo access token** (expo.dev → Account → Access tokens) and set it as a secret.
- **FCM (web):** in the [Firebase console](https://console.firebase.google.com) → Project Settings → **Service accounts** → *Generate new private key* (downloads a JSON). This is the same Firebase project Appwrite was using — reuse it.
  - For the **web client**: Firebase Cloud Messaging → generate a **VAPID key pair** (Web Push certificates). The web app registers a service worker and calls `getToken({ vapidKey })`.
- Set the secrets:
  ```bash
  supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
  supabase secrets set EXPO_ACCESS_TOKEN="<optional>"
  ```

**c) The `send-push` Edge Function:**
```bash
supabase functions new send-push
# implement per §6.6: look up device_tokens (service-role), branch by provider,
# send via Expo Push API / FCM v1, prune dead tokens from receipts
supabase functions serve send-push     # local test
supabase functions deploy send-push
```

**d) App-side token acquisition (consumer responsibility, documented in README):**
- Native: `expo-notifications` → request permission → `getExpoPushTokenAsync()` → `useRegisterDevice({ token, platform, provider: 'expo' })`.
- Web: register the Firebase messaging service worker → `getToken({ vapidKey })` → `useRegisterDevice({ token, platform: 'web', provider: 'fcm' })`.
- Call `useUnregisterDevice()` on logout.

> Local testing: Edge Functions run under `supabase functions serve`; Expo sends work against the real Expo endpoint (use a dev-build push token). For FCM, mock the transport in unit tests to avoid needing a live web token.

---

## 9. Phased implementation plan + Progress Tracker

Phases are ordered by dependency. **Agents: update the checkboxes and the handoff note when you finish a session.** A phase is "done" only when `bun run lint` and `bun run test` pass for its scope.

| Phase | Depends on | Scope | Acceptance |
|---|---|---|---|
| **P0 — Repo scaffold** | 8.1, 8.2 | Create new repo; copy build tooling, tsconfig, eslint/prettier, tsup configs, `post-build.js`, test harness skeleton; new `package.json` per §3; install deps. | `bun install` clean; empty `bun test` runs; `tsup` builds an empty entry. |
| **P1 — Types & client** | P0 | `src/types.ts` (re-export supabase-js helper types + error type), generic `createSupabaseClient` (§3), `context.ts`, `useSupabase.ts`. **No schema types shipped** — generic over the consumer's `Database`. | Builds + typechecks with **no Supabase project**; generic `Database` threads through. |
| **P2 — Provider + factory + TanStack wrappers** | P1 | Port `useQuery`/`useMutation`/`useSuspenseQuery`/`useLazyQuery`/`useQueryClient`; `SupabaseProvider`(+Native) with `onAuthStateChange` wiring (§7); scaffold `createSupabaseQuery<Database>()` returning the provider + an (initially empty) typed hook set that later phases populate. | Provider renders; a trivial `useQuery` with a **mocked** client resolves in a happy-dom test. |
| **P3 — Keys + QueryBuilder + Realtime helper** | P2 | Rename `Keys` verbs (§4); rewrite `QueryBuilder` as serializable descriptor (§5); `db/realtime.ts` helper. | Unit tests: `q().eq().order().build()` shape; `applyTo` chains correctly (mock PostgREST builder). |
| **P4 — `db/` read + write hooks** | P3, 8.3, 8.4, 8.5 | `queryOptions.ts`, `useRow(s)`, infinite/paginated, create/update/upsert/delete, increment/decrement (RPC), realtime wiring. Optimistic + rollback preserved. | CRUD + realtime + optimistic tests green against local stack. |
| **P5 — Offline engine** | P4 | Port `offline/` verbatim except `registry.ts` + `conflictAwareUpdate.ts` (§6.5). | Existing offline test scenarios (pause → replay → conflict-resolve) pass, ported to Supabase calls. |
| **P6 — Auth** | P2, 8.9 | `auth/` module per §7. | Login/signup/logout/updateUser/OAuth/MFA/identities tested against local stack + Inbucket. |
| **P7 — Storage** | P2, 8.6 | `storage/` hooks (§6.2). | Upload/download/list/remove/URL tests against local storage. |
| **P8 — Functions/RPC** | P2, 8.11 | `functions/` (`invoke` + `useRpc`). | `invoke` + `rpc` tested. |
| **P9 — Teams (v1)** | P4, 8.8 | `teams/` on custom tables + membership RPCs; wire team-row mutations into the offline registry. | Team CRUD + membership + RLS tests. |
| **P9b — Push notifications** | P4, P8, 8.12 | `push/` client hooks (`device_tokens`) + `send-push` Edge Function (Expo native + FCM web). | Register/unregister tested against local stack; Edge Function unit-tested (mock Expo/FCM), receipts prune dead tokens. |
| **P10 — Docs & release** | all | Rewrite `README.md` (offline-first, RLS-instead-of-permissions, realtime, RN setup, push setup), migration guide for consumers, publish config, CI (`bun test`, `bun lint`, `gen:types`). | README complete; version `0.1.0`; dry-run publish. |

### Progress Tracker (edit me)
- [x] **P0** Repo scaffold — _handoff:_ Done in `~/code/supabase-query`. Bundler is **tsdown** (not tsup) — `tsdown.config.ts` dual build → `dist/` + `react-native/` via named entries (no post-build swap needed; supabase-js is universal). Tooling ported: `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `bunfig.toml` (realtime mock preload deferred to P3/P4). `package.json` exports use `.mjs`/`.d.mts` (ESM) + `.cjs`/`.d.cts` (CJS). Note: tsdown needs the `unrun` devDep to load the TS config. `src/{index,index.shared,native-entry}.ts` are stubs. `bun run build`/`typecheck`/`test`/`lint` all green. **Next: P1.**
- [x] **P1** Types & client — _handoff:_ Done in `~/code/supabase-query`, no manual deps. `src/types.ts` (supabase-js re-exports + `AnyDatabase`/`AnySupabaseClient`, `SupabaseException = PostgrestError | AuthError`, `Prettify`/`QueryOptions`/`KVStorage`), generic `createSupabaseClient<Database = AnyDatabase>` → `{ supabase }`, `context.ts`, `useSupabase.ts`, wired into `index.shared.ts`. build/typecheck/test/lint green. **Next: P2** (TanStack wrappers + provider + factory scaffold; mocked client, no live stack).
- [x] **P2** Provider + wrappers — _handoff:_ Done in `~/code/supabase-query`, no manual deps/live stack. Ported the 5 TanStack wrappers (`useQuery`/`useMutation`/`useSuspenseQuery`/`useLazyQuery`/`useQueryClient`) verbatim except error type → `SupabaseException` (dropped the GraphQL `[]` array-ness; single error, defaulted generics). `SupabaseProvider.tsx` (web, keeps devtools) + `SupabaseProviderNative.tsx` (no devtools) share `SupabaseProviderProps` (type-only import, so native never pulls devtools) and a shared `src/authState.ts` — `useAuthStateSync` wires `supabase.auth.onAuthStateChange` → `queryClient.setQueryData(AUTH_USER_QUERY_KEY, user)` + `clear()` on `SIGNED_OUT`, unsubscribes on unmount. **`AUTH_USER_QUERY_KEY = ['supabase','auth']` is a placeholder — P3/P6 must make it equal `Keys.auth().key()` and have `useUser` read the same key.** Factory: `makeCreateSupabaseQuery(Provider)` (internal) is bound per-platform in `index.ts`/`native-entry.ts`; `createSupabaseQuery<Database>()` returns the provider + wrappers + a `Database`-typed `useSupabase` (first instance of the per-table typing P4+ extends). Context stays loosely typed (`AnySupabaseClient`). Tests: `tests/p2.provider.test.tsx` (mocked client — provider renders, useQuery/useMutation resolve, onAuthStateChange mirrors user into cache + unsubscribe). **Gotcha:** use render's bound queries, not `screen` (global `document.body` not wired under the happy-dom preload). build/typecheck/test(7)/lint all green. **Next: P3** (Keys verbs rename + QueryBuilder descriptor + `db/realtime.ts`; reconcile `AUTH_USER_QUERY_KEY` with `Keys.auth()`).
- [x] **P3** Keys + QueryBuilder + Realtime — _handoff:_ Done in `~/code/supabase-query`, no manual deps/live stack. **`Keys.ts`:** ported the class mechanism verbatim; root `'appwrite'`→`'supabase'`. `account()`→`auth()` (interface `Account`→`Auth`; dropped `jwt`/`logs`/`status`/`pushTarget`; renamed `emailToken`→`emailOtp`, `phoneToken`→`phoneOtp`, `magicUrl`→`magicLink`, `oauth2Token`→`oauth`; `session()` is now a terminal single-session key — multi-session listing dropped). Collapsed both DB hierarchies into `schema(name='public')`→`table(name)`/`tables()`→`row(id)`/`rows()`. Kept storage (`buckets`/`bucket`/`files`/`file`), functions (`functions`/`function(name)`; dropped `executions`), teams (`teams`/`team`/`memberships`/…). Removed `databases`/`tablesDB`/`collection(s)`/`document(s)`/`transaction(s)`/`operations`/`locale`/`messaging`. Leaves `create/update/upsert/delete/key` unchanged. **`authState.ts` reconciled:** `AUTH_USER_QUERY_KEY = Keys.auth().key()` (= `['supabase','auth']`) so it can't drift from P6's `useUser`. **`QueryBuilder.ts`:** rewritten as a serializable descriptor — records `{kind:'postgrest',fn,args}` (fn is always a real supabase-js filter-builder method) + `{kind:'geo',fn,column,args}` for PostGIS. `build()` returns the op list (→ query key, JSON-serializable), `applyTo(builder)` replays postgrest ops in order (skips geo), `geoOps()`/`hasGeo()` expose spatial predicates for the P4 db layer to route to an RPC. Kept the old fluent aliases (`equal`→eq/in, `greaterThan`→gt, `startsWith`→like`x%`, `between`→gte+lte, `cursorAfter`→gt+order, `isNotNull`→not(is,null), etc.) so consumer call-sites don't change. **`src/db/realtime.ts`:** `subscribeToTable(supabase, {schema,table,filter}, onChange)` postgres_changes helper returning an unsubscribe fn; JSDoc encodes the 3 manual prereqs (publication, RLS, REPLICA IDENTITY FULL). All exported from `index.shared.ts`. **Gotchas hit:** (1) tsconfig has `noUncheckedIndexedAccess` — `applyTo` needs `acc[op.fn]` cast to a fn before invoking; (2) supabase-js `.on('postgres_changes',…)` overload widens `event` and rejects a conditional-spread filter object — pass `{event:'*',schema,table,filter}` inline (undefined filter is fine) and cast the payload. Tests: `p3.keys.test.ts`, `p3.querybuilder.test.ts` (build shape + `applyTo` order via a Proxy mock builder + geo routing), `p3.realtime.test.ts` (channel name/config/payload/cleanup via mock client). typecheck/test(38)/lint/build all green. **Next: P4** (db read+write hooks; needs local `supabase start` stack + schema/RLS/realtime per 8.3–8.5; wire `subscribeToTable` into `useRow(s)`/`useInfiniteRows`, route `geoOps()` to spatial RPCs).
- [x] **P4** db hooks — _handoff:_ Done in `~/code/supabase-query` against a **live local `supabase start` stack** (fixture schema already present: `todos` + `places`, RLS, realtime publication + `replica identity full`, `increment_column` + `places_within` PostGIS RPCs; `tests/database.types.ts` fixture). **`src/db/`** created: `types.ts`, `queryOptions.ts` (`getRowsQuery`/`getRowQuery`; geo predicates route to an RPC named via a `geoRpc` option), `useRow`/`useSuspenseRow`, `useRows`/`useSuspenseRows`, `useInfiniteRows`, `useRowsWithPagination`(+suspense), `useCreateRow`, `useUpdateRow`, `useUpsertRow`, `useDeleteRow`, `useIncrementColumn` (+shared `useAdjustColumn(sign)`), `useDecrementColumn`, `factory.ts` (`makeDbHooks<Database>()`), `index.ts`. All exported from `index.shared.ts`; `createSupabaseQuery` spreads `makeDbHooks<Database>()`. **API shape:** reads are positional `(table, builder?, options?)` — the typed factory currys `table` + infers row types (`useRow('todos', id)`, `useRows('todos', q=>q.eq('done',false))`); accessors `row` (single) and `rows`+`total` (list, from `count:'exact'`). No more `JSON.parse(data)` / `$id` juggling — rows are plain typed objects. **RLS replaces permissions** — hooks take no `permissions` arg. **Mutations carry `table`/`schema`/`id` in their VARIABLES** (not the closure) so P5 can replay from persisted vars; static mutationKeys `Keys.schema().table('').rows().create()/.update()/.upsert()/.delete()` (+`'incrementColumn'`/`'decrementColumn'` leaves). Exported standalone fns `createRowFn`/`updateRowFn`/`upsertRowFn`/`deleteRowFn`/`incrementColumnFn` for the P5 registry; the factory currys `table` into vars via `bindMutation` (re-wraps `mutate`/`mutateAsync`), so consumers call `useCreateRow('todos'); mutate(values)`. Optimistic + rollback preserved (onMutate captures `previousEntries` via `getQueriesData(rowKey)`, onError restores, onSettled invalidates `rows()`). Row key = `Keys.schema(schema).table(table).row(id).key()` with **no select suffix** so optimistic writes + realtime + list-invalidation share one canonical entry; list key appends `{ops,select}` for filter variants. increment/decrement → `.rpc('increment_column', {p_table,p_id,p_column,p_amount})` (decrement negates). Realtime wired into `useRow` (filter `id=eq.${id}`) + `useRows` (set changed row key / remove on DELETE / invalidate `rows()`), `subscribe=true` default. **Bug fixed (P3 latent):** `QueryBuilder.applyTo` called the builder method **detached** (`const m = acc[fn]; m(...)`), losing `this` → real supabase-js filter builders throw `this.url` undefined; changed to `m.call(acc, ...)`. The P3 Proxy mock hid it (geo unit tests unaffected). **Fixture migration fixup:** the API roles had only TRUNCATE/TRIGGER/REFERENCES — added `grant select,insert,update,delete on todos to authenticated` + `grant select on places to anon,authenticated; grant insert on places to authenticated` and re-ran `supabase db reset` (missing DML grants surface as "permission denied for table", a GRANT error distinct from RLS). **Tests:** `tests/setup/localStack.ts` (`createAuthedUser` = admin `createUser`+`signInWithPassword`, so RLS is exercised as a real user; deterministic local demo keys), `tests/p4.db.test.tsx` (11: read/list/create/update/rollback/upsert/delete/increment/decrement/pagination/geo, `subscribe:false`), `tests/p4.realtime.test.tsx` (live realtime insert delivery). **Gotchas:** (1) **happy-dom replaces global `WebSocket`** with a stub that can't reach Realtime — `tests/setup/preload.ts` now captures Bun's native `WebSocket` as `globalThis.__NATIVE_WEBSOCKET__` **before** `GlobalRegistrator.register()`, and `localStack` injects it via `createClient(..., { realtime: { transport } })`; (2) mutation-seeded cache entries have **no active observer**, so `gcTime:0` evicts them instantly — P4 tests use `gcTime:Infinity` to assert on optimistic/seeded cache. build/typecheck/lint/test(50) all green. **Next: P5** (offline engine) — port `offline/` verbatim except `registry.ts` (re-point entries to the P4 standalone fns, `scope.id`→`'supabase'`, drop messaging/account entries, keep row create/update/upsert/delete/increment/decrement) + `conflictAwareUpdate.ts` (swap the gql fetch/update for `supabase.from(table).select().eq('id',id).single()` / `.update(resolved).eq('id',id).select().single()`; drop the `JSON.parse(data)` unwrap — remote is a plain row).
- [x] **P5** Offline engine — _handoff:_ Done in `~/code/supabase-query` against the **live local `supabase start` stack** (reused the P4 `todos` fixture + RLS). Ported `src/offline/` — **verbatim** (only Appwrite→Supabase retypes): `types.ts` (`MutationFn` now takes `AnySupabaseClient`), `conflictResolution/{resolve.ts,types.ts}` (dropped `import { Models } from 'appwrite'`; `ConflictContext` rows are plain `Record<string,unknown>` — added a `ConflictDocument` alias), `network/{web.ts,native.ts}` (untouched logic). **Rewritten:** `mutations/conflictAwareUpdate.ts` — swapped the gql fetch/write for `supabase.from(table).select().eq('id',id).single()` / `.update(resolved).eq('id',id).select().single()`; **no `JSON.parse(data)`** (remote is a plain row); `'abort'` (server-wins) writes remote to the row cache and returns without a server write; variables are `UpdateRowVariables` (`{table,schema,id,values}`). `mutations/registry.ts` — replaced `gqlMutation` with `supabaseMutation(fn)` wrapping the P4 standalone fns (`createRowFn`/`deleteRowFn`/`upsertRowFn`/`incrementColumnFn`); keys are `Keys.schema().table('').rows().create()/.delete()/.upsert()` + `[...rows().key(),'incrementColumn'|'decrementColumn']` (decrement entry **negates** `amount`, matching the hook); `scope.id:'supabase'`; **update registered separately** as conflict-aware; **no auth/messaging/team entries** (auth is online-only per §6.5; teams deferred to P9). `createOfflineClient.ts` — swapped `createAppwriteClient`→`createSupabaseClient` (takes `{url,anonKey,authStorage,isNative}`), cache key `'supabase-query-offline-cache'`; returns `{supabase,queryClient,persister,startPersistence,conflictStrategy}`; **not generic** (a generic `SupabaseClient<Database>` won't narrow to the loose `AnySupabaseClient` the context holds). **Also edited `db/useUpdateRow.ts`** (P4 left this out): `onMutate` now deep-copies the row as `baseSnapshot` and stashes `willPerformOfflineMutation = onlineManager.isOnline()===false` onto `ctx.meta`; the mutationFn reads that flag and routes offline-created updates through `conflictAwareUpdate(ctx.meta.conflictStrategy)`, else `updateRowFn`. Added optional `baseSnapshot`/`willPerformOfflineMutation` to `RowMutationContext`. **Two replay paths both covered:** (A) **in-session** resume runs the hook's mutationFn (flag from onMutate on the shared `MutationFunctionContext` — verified `mutation.js` builds one `mutationFnContext` per `execute()` and threads it to both onMutate and mutationFn); (B) **after-restart** replay runs the registered default mutationFn (`conflictAwareUpdate`), reading `baseSnapshot` from the persisted `mutation.state.context`. **TanStack v5.101 note:** callback sigs are `onMutate(vars,ctx)` / `mutationFn(vars,ctx)` / `onError(err,vars,onMutateResult,ctx)` — the onMutate *result* is still the 3rd positional (P4 hooks unaffected); `ctx.meta` is the mutation's `meta` and is where `conflictStrategy` (set as a `mutations.meta` default in `createOfflineClient`) is read. **Exports:** offline core from `index.shared.ts`; `webNetworkAdapter` from `index.ts`, `reactNativeNetworkAdapter` from `native-entry.ts` (keeps netinfo out of the web bundle). **Tests:** `tests/p5.offline-client.test.ts` (8, no stack — persister selection, startPersistence contract, network-adapter→onlineManager, registry shape/no-auth-keys, default scoping); `tests/p5.offline.test.tsx` (5, live — offline create pauses→runs on reconnect; paused create persists to localStorage under the create key and **replays after a simulated restart** via a fresh client + `startPersistence().restored`; and all three conflict strategies server-wins/last-write-wins/merge-shallow). **Gotchas:** (1) `service_role` gets **403** on `.from()` writes — the P4 fixture granted DML only to `authenticated`/`anon`, so the "remote change" + row cleanup go through a **second authed user client** (RLS allows own-row writes), not the admin client; (2) paused-mutation tests need `mutations.networkMode:'online'` (createOfflineClient defaults to `offlineFirst`) — override it **preserving `meta`** so `conflictStrategy` survives; (3) `afterEach` resets the **global** `onlineManager` to online + clears the offline cache so later suites aren't left offline; (4) neutralize leftover paused mutations (swap mutationFn→noop, clear cache, unmount) before flipping online in the restart test. build/typecheck/lint/test(63) all green (one pre-existing p4 realtime-delivery test is timing-flaky under full-suite load; passes in isolation and on re-run). **Next: P6** (auth) — `AUTH_USER_QUERY_KEY`/`Keys.auth()` already reconciled; auth mutations stay **out** of the offline registry.
- [x] **P6** Auth — _handoff:_ Done in `~/code/supabase-query` against the **live local `supabase start` stack** (+ admin API for deterministic OTPs). **`src/auth/`** created (GoTrue), consolidating the ~50 Appwrite `account/` files per §7 into: `queryOptions.ts` (`getUserQuery`/`getSessionQuery`), `useUser`(+`useSuspenseUser`), `useSession`, `useSignUp`, `useLogin`, `useLogout`, `useOAuthLogin`, `useMagicLink`, `useEmailOtp` (`{send,verify}`), `usePhoneOtp` (`{send,verify}`), `useAnonymousLogin`, `useUpdateUser` (collapses name/email/password/phone/prefs → one hook, all metadata), `usePasswordRecovery` (`resetPasswordForEmail`) + `useResetPassword` (`updateUser({password})`), `useVerification` (`{verify,resend}`), `useMfa` (`{factors,enroll,challenge,verify,challengeAndVerify,unenroll}` — one hook wrapping `auth.mfa.*`), `useIdentities` (`{identities,linkIdentity,unlinkIdentity}`), `types.ts`, `factory.ts` (`makeAuthHooks()`), `index.ts`. **Dropped** per §7: `useListSessions`/`useGetSession(id)`/`useDeleteSessions` (multi-session is admin-only), push targets (→ P9b `push/`), `useLogs`, `useUpdateStatus`, `useCreateJWT` (session already carries the JWT). **Reads use `Keys.auth().key()`** so they stay reconciled with `authState.ts`. **`authState.ts` enhanced (extends P2):** the provider's `onAuthStateChange` now **also mirrors the session** into `AUTH_SESSION_QUERY_KEY = Keys.auth().session()` (new export) alongside the user key, so **`useSession` is reactive** like `useUser` (login/logout/refresh update it with no invalidation); `SIGNED_OUT` early-returns after `queryClient.clear()`. **Auth mutations stay OUT of the offline registry** (GoTrue is online-only, §6.5) — registry untouched. **Factory:** `...makeAuthHooks()` spread into `createSupabaseQuery` (not `Database`-parameterized — `User`/`Session` are fixed); all exported from `index.shared.ts`. **Config (`supabase/config.toml`, committed) — required a stack restart to apply:** enabled `enable_anonymous_sign_ins = true`, `[auth.mfa.totp] enroll_enabled/verify_enabled = true`, and raised `[auth.rate_limit] email_sent` 2→100 (the default 2/hr throttles the email-sending tests). **Test gotchas (`tests/p6.auth.test.tsx`, 10 tests):** (1) each fresh anon client needs a **unique `auth.storageKey`** + isolated in-memory storage — sharing the URL-derived default key makes GoTrue's `navigator.locks` session-serialization cross-contaminate and **hang** under happy-dom; (2) `mfa.listFactors().data.totp` is **verified-only** — a freshly enrolled (unverified) factor appears in `.data.all`, not `.totp`; (3) auth-dependent **queries** (`useMfa` `factors`, `useIdentities` `identities`) throw on mount when unauthenticated and won't auto-refetch after a later login (nothing invalidates them) — mount them on an **already-authed client** (used `createAuthedUser`), which is the real-world usage; (4) **OAuth** tested with a **mocked** `signInWithOAuth` client (no provider configured locally) asserting args+returned url; (5) email-OTP **verify** tested end-to-end via `admin.generateLink({type:'magiclink'})` → `properties.email_otp` (deterministic, no Inbucket scraping), while magic-link/recovery/`send` assert the dispatch path. build/typecheck/lint/test(73, +10) all green. **Next: P7** (storage) — `storage/` hooks on `supabase.storage.from(bucket)` (§6.2); needs buckets + storage RLS created (§8.6) before the live tests.
- [ ] **P7** Storage — _handoff:_ …
- [ ] **P8** Functions/RPC — _handoff:_ …
- [ ] **P9** Teams (v1) — _handoff:_ …
- [ ] **P9b** Push notifications — _handoff:_ …
- [ ] **P10** Docs & release — _handoff:_ …

---

## 10. Decisions — RESOLVED with the repo owner (2026-07-07)

1. **Package/repo name** — ✅ `@zeroin.earth/supabase-query`, repo created at `~/code/supabase-query`.
2. **Drop locale / avatars / account logs** — ✅ dropped. **Messaging is NOT dropped** — it becomes the `push/` module (Expo native + FCM web) per §6.6 / §8.12. Push targets fold into `device_tokens`.
3. **Collapse the two DB APIs into one `db/` module** — ✅ yes.
4. **Teams** — ✅ **in v1** (Phase P9, no longer optional). Custom tables + membership RPCs; see §8.8.
5. **SSR support** (`@supabase/ssr`) — ✅ out of scope for v1 (React + RN SPAs). Revisit later.
6. **Geo/PostGIS QueryBuilder methods** — ✅ **KEEP** (PostGIS is enabled). Backed by spatial RPCs; see §5 + §8.7.
7. **Multi-session management** (list/delete other sessions) — ✅ drop (no client API); revisit via an Edge Function if needed.
8. **Typing DX** — ✅ **typed factory** `createSupabaseQuery<Database>()` (see §3). The library is **schema-generic and ships no `Database` type**; consumers pass their own generated type once and get gql.tada-style inference (table autocomplete, row inference, column-checked filters). No real Supabase project is needed to build the library — only a **local** stack for P4 integration tests.

---

## 11. Supabase library insights (quick reference for agents new to Supabase)

- **One client, many services.** `createClient()` → `.from` (DB/PostgREST), `.auth` (GoTrue), `.storage`, `.channel`/`.realtime`, `.functions`, `.rpc`. There is no per-service constructor like Appwrite.
- **Every DB call returns `{ data, error, count? }`** — never throws. Wrap: `if (error) throw error`. There are no exceptions to catch like `AppwriteException`; standardize on throwing `error` so the TanStack error path still works.
- **`.single()` / `.maybeSingle()`** for one-row reads (`.single()` errors if not exactly one row).
- **Types come from your DB**, not hand-written documents. `supabase gen types` → `Database` → `createClient<Database>()` makes `.from('todos')` fully typed. Regenerate after every migration.
- **RLS is the auth model.** No per-row permission strings. If a query returns empty unexpectedly, suspect a missing/wrong policy before a bug.
- **Realtime needs three things:** table in `supabase_realtime` publication, RLS SELECT access, and `REPLICA IDENTITY FULL` for old-row payloads.
- **React Native quirks:** `import 'react-native-url-polyfill/auto'` at entry; pass `AsyncStorage` to `auth.storage`; set `detectSessionInUrl: false`. Realtime works over RN's WebSocket.
- **GoTrue manages its own session storage**, independent of the TanStack offline persister. Auth is online-only — don't put auth mutations in the offline replay queue.
- **Local dev = `supabase start`** (full Docker stack + Studio + Inbucket for emails). This is your test backend; wire tests to the printed local URL/anon key.
- **PostgREST embeds** replace Appwrite relationship expansion: `.select('*, comments(*), author(name)')`.
- **`.rpc()` is your escape hatch** for anything PostgREST can't express (increment, atomic multi-step, aggregates) — write a SQL function, call it typed.
```
```

---

_Generated as the migration blueprint. Keep this file in the new repo's root too, so agents there have it alongside the code._
