import { useEffect } from 'react'

import { getRowsQuery } from './queryOptions'
import { subscribeToTable } from './realtime'
import type { BuilderFn, ReadOptions, Row, RowsResult } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'
import { useSuspenseQuery } from '../useSuspenseQuery'

/** Keeps every cached list for `table` fresh: writes the changed row into its
 * canonical single-row key and invalidates the `rows()` prefix (which covers all
 * filtered/paginated variants). Mirrors the Appwrite `useTableRowsRealtime`. */
function useRowsRealtime(schema: string, table: string, subscribe: boolean) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!subscribe) return

    return subscribeToTable<Row & { id?: unknown }>(supabase, { schema, table }, (payload) => {
      const rowsKey = Keys.schema(schema).table(table).rows().key()

      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id
        if (id != null) {
          queryClient.removeQueries({
            queryKey: Keys.schema(schema).table(table).row(String(id)).key(),
          })
        }
      } else {
        const id = payload.new?.id
        if (id != null) {
          queryClient.setQueryData(
            Keys.schema(schema).table(table).row(String(id)).key(),
            payload.new,
          )
        }
      }

      void queryClient.invalidateQueries({ queryKey: rowsKey })
    })
  }, [supabase, queryClient, schema, table, subscribe])
}

/**
 * Fetches a list of rows, optionally filtered/ordered via the {@link QueryBuilder},
 * and keeps the list live via realtime. Returns `{ total }` from PostgREST's
 * `count: 'exact'` alongside the standard query result.
 *
 * @typeParam TRow - The row's column shape (inferred from your `Database` by the
 *   `createSupabaseQuery` factory; pass explicitly when using the hook directly).
 *
 * @example
 * ```tsx
 * const { rows, total } = useRows('todos', (q) => q.eq('done', false).order('created_at'))
 * ```
 *
 * @param table - The table name.
 * @param builder - Optional fluent filter/modifier builder.
 * @param options - `schema`, `select`, `subscribe`, `geoRpc`, and query options.
 * @returns The query result plus `rows` and `total` accessors.
 */
export function useRows<TRow extends Row = Row>(
  table: string,
  builder?: BuilderFn<TRow>,
  { schema = 'public', select, subscribe = true, geoRpc, ...opts }: ReadOptions = {},
) {
  const { supabase } = useSupabase()
  const config = getRowsQuery<TRow>(supabase, { schema, table, select, builder, geoRpc })

  const result = useQuery<RowsResult<TRow>, SupabaseException>({ ...config, ...opts })

  useRowsRealtime(schema, table, subscribe)

  return { ...result, rows: result.data?.rows, total: result.data?.total }
}

/**
 * Suspense variant of {@link useRows}. Suspends while the list loads.
 *
 * @example
 * ```tsx
 * const { rows, total } = useSuspenseRows('todos')
 * ```
 */
export function useSuspenseRows<TRow extends Row = Row>(
  table: string,
  builder?: BuilderFn<TRow>,
  { schema = 'public', select, subscribe = true, geoRpc, ...opts }: ReadOptions = {},
) {
  const { supabase } = useSupabase()
  const config = getRowsQuery<TRow>(supabase, { schema, table, select, builder, geoRpc })

  const result = useSuspenseQuery<RowsResult<TRow>, SupabaseException>({ ...config, ...opts })

  useRowsRealtime(schema, table, subscribe)

  return { ...result, rows: result.data?.rows, total: result.data?.total }
}
