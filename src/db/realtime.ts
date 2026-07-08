import type { AnySupabaseClient } from '../types'

/** Postgres change event delivered on a `postgres_changes` subscription. */
export type PostgresChangePayload<TRow = Record<string, unknown>> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  /** Present on INSERT/UPDATE. */
  new: TRow
  /**
   * Present on UPDATE/DELETE. Only fully populated when the table has
   * `REPLICA IDENTITY FULL`; otherwise just the primary key.
   */
  old: Partial<TRow>
}

export type SubscribeOptions = {
  /** Postgres schema — defaults to `'public'`. */
  schema?: string
  /** Table name to watch. */
  table: string
  /**
   * Optional PostgREST-syntax filter, e.g. `` `user_id=eq.${userId}` ``.
   * Only rows matching it (and passing RLS) are delivered.
   */
  filter?: string
}

/**
 * Subscribes to Postgres change events for a table via `postgres_changes` and
 * invokes `onChange` for every INSERT/UPDATE/DELETE. Returns an unsubscribe
 * function.
 *
 * This is the shared replacement for the inlined `Channel.tablesdb(...)`
 * subscriptions the Appwrite read hooks used; `useRow`/`useRows`/
 * `useInfiniteRows` wire it in exactly where `useCollectionRealtime` was
 * (migration plan §5).
 *
 * @remarks Three server-side prerequisites (all manual — see plan §8.5):
 * 1. the table must be in the `supabase_realtime` publication;
 * 2. RLS is enforced on realtime — the subscribed user must be allowed to
 *    `SELECT` the rows, or nothing is delivered;
 * 3. `UPDATE`/`DELETE` payloads only include the full `old` row when the table
 *    has `REPLICA IDENTITY FULL`.
 */
export function subscribeToTable<TRow = Record<string, unknown>>(
  supabase: AnySupabaseClient,
  { schema = 'public', table, filter }: SubscribeOptions,
  onChange: (payload: PostgresChangePayload<TRow>) => void,
): () => void {
  const channel = supabase
    .channel(`realtime:${schema}:${table}:${filter ?? '*'}`)
    .on('postgres_changes', { event: '*', schema, table, filter }, (payload) =>
      onChange(payload as unknown as PostgresChangePayload<TRow>),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
