import { useEffect } from 'react'

import { getRowQuery } from './queryOptions'
import { subscribeToTable } from './realtime'
import type { ReadOptions, Row } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'
import { useSuspenseQuery } from '../useSuspenseQuery'

/** Keeps a single cached row in sync via a `postgres_changes` subscription
 * filtered to that row's id (mirrors the Appwrite `useRowRealtime`). */
function useRowRealtime(schema: string, table: string, id: string, subscribe: boolean) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!subscribe || !id) return

    return subscribeToTable<Row>(supabase, { schema, table, filter: `id=eq.${id}` }, (payload) => {
      const key = Keys.schema(schema).table(table).row(id).key()
      if (payload.eventType === 'DELETE') {
        queryClient.removeQueries({ queryKey: key })
      } else {
        queryClient.setQueryData(key, payload.new)
      }
    })
  }, [supabase, queryClient, schema, table, id, subscribe])
}

/**
 * Fetches a single row by `id` and keeps it live via realtime.
 *
 * @typeParam TRow - The row's column shape (inferred from your `Database` by the
 *   `createSupabaseQuery` factory; pass explicitly when using the hook directly).
 *
 * @example
 * ```tsx
 * const { row, isLoading } = useRow('todos', id)
 * ```
 *
 * @param table - The table name.
 * @param id - The row's primary-key (`id`) value.
 * @param options - `schema`, `select`, `subscribe`, and TanStack query options.
 * @returns The query result plus a `row` accessor (`data`).
 */
export function useRow<TRow extends Row = Row>(
  table: string,
  id: string,
  { schema = 'public', select, subscribe = true, ...opts }: ReadOptions = {},
) {
  const { supabase } = useSupabase()
  const config = getRowQuery<TRow>(supabase, { schema, table, id, select })

  const result = useQuery<TRow, SupabaseException>({ ...config, ...opts })

  useRowRealtime(schema, table, id, subscribe)

  return { ...result, row: result.data }
}

/**
 * Suspense variant of {@link useRow}. Suspends while the row loads.
 *
 * @example
 * ```tsx
 * const { row } = useSuspenseRow('todos', id)
 * ```
 */
export function useSuspenseRow<TRow extends Row = Row>(
  table: string,
  id: string,
  { schema = 'public', select, subscribe = true, ...opts }: ReadOptions = {},
) {
  const { supabase } = useSupabase()
  const config = getRowQuery<TRow>(supabase, { schema, table, id, select })

  const result = useSuspenseQuery<TRow, SupabaseException>({ ...config, ...opts })

  useRowRealtime(schema, table, id, subscribe)

  return { ...result, row: result.data }
}
