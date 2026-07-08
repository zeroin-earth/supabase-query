import type { AuthError, PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export type { Session, SupabaseClient, User } from '@supabase/supabase-js'

/**
 * The library is generic over the consumer's generated `Database` type (from
 * `supabase gen types`). This permissive default mirrors supabase-js's own and
 * keeps the untyped path working; the typed factory (`createSupabaseQuery`)
 * supplies a real schema so table names and row types infer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = any

/** A loosely-typed client for the React context; the factory re-types per call. */
export type AnySupabaseClient = SupabaseClient<AnyDatabase>

/**
 * The error type surfaced through TanStack Query. Supabase calls resolve to
 * `{ data, error }` and never throw, so hooks re-throw `error`; this is what
 * `useQuery`/`useMutation` expose as their `error`. Storage/Functions phases
 * may widen this union as needed.
 */
export type SupabaseException = PostgrestError | AuthError

/**
 * Resolves intersection and mapped types into a flat object for cleaner IntelliSense.
 * @internal
 */
export type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type QueryOptions = {
  enabled?: boolean
  retry?: boolean | number | ((failureCount: number, error: unknown) => boolean)
  retryDelay?: number | ((attemptIndex: number) => number)
  staleTime?: number
}

/**
 * A minimal key-value storage interface compatible with both `localStorage`
 * (sync) and React Native `AsyncStorage` (async). Used for GoTrue session
 * storage on native and by cross-screen helpers.
 */
export type KVStorage = {
  getItem: (key: string) => string | null | Promise<string | null>
  setItem: (key: string, value: string) => void | Promise<void>
  removeItem: (key: string) => void | Promise<void>
}
