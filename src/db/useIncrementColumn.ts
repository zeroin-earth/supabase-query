import { cancelRowQueries, findCachedRow, patchRow, rowKeyOf } from './optimisticRows'
import type { IncrementColumnVariables, RowMutationContext } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/** Calls the increment RPC with a signed amount. PostgREST cannot express
 * `col = col + n`, so this routes through a SQL function (migration plan §8.7).
 * Standalone for the offline registry (P5). */
export async function incrementColumnFn(
  supabase: AnySupabaseClient,
  { table, id, column, amount = 1, rpc = 'increment_column' }: IncrementColumnVariables,
): Promise<void> {
  const { error } = await supabase.rpc(rpc, {
    p_table: table,
    p_id: id,
    p_column: column,
    p_amount: amount,
  })
  if (error) throw error
}

/** Shared mutation for increment/decrement — `sign` flips the amount and the
 * optimistic delta. Both operations hit the same RPC. */
export function useAdjustColumn(sign: 1 | -1) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<void, SupabaseException, IncrementColumnVariables, RowMutationContext>({
    mutationKey: [
      ...Keys.schema().table('').rows().key(),
      sign === 1 ? 'incrementColumn' : 'decrementColumn',
    ],
    mutationFn: ({ amount = 1, ...rest }) =>
      incrementColumnFn(supabase, { ...rest, amount: sign * amount }),
    onMutate: async ({ table, schema = 'public', id, column, amount = 1 }) => {
      const target = { schema, table, id }
      const rowKey = rowKeyOf(target)
      await cancelRowQueries(queryClient, target)
      const previousEntries = queryClient.getQueriesData({ queryKey: rowKey })

      // The bump is computed once from the cached row, not per cache entry, so
      // the row key and every list agree on the optimistic value.
      const base = findCachedRow(queryClient, target)
      if (base) {
        const current = (base[column] as number) ?? 0
        patchRow(queryClient, target, { [column]: current + sign * amount })
      }

      return { previousEntries, rowKey, baseSnapshot: base }
    },
    onError: (_error, { table, schema = 'public', id, column }, context) => {
      for (const [key, data] of context?.previousEntries ?? []) {
        queryClient.setQueryData(key, data)
      }
      if (context?.baseSnapshot) {
        patchRow(
          queryClient,
          { schema, table, id },
          {
            [column]: context.baseSnapshot[column],
          },
        )
      }
    },
    onSettled: (_data, _error, { table, schema = 'public', id }) => {
      // Re-fetch the row (the RPC returns void) and refresh lists.
      void queryClient.invalidateQueries({
        queryKey: Keys.schema(schema).table(table).row(id).key(),
      })
      void queryClient.invalidateQueries({
        queryKey: Keys.schema(schema).table(table).rows().key(),
      })
    },
  })
}

/**
 * Mutation hook to atomically increment a numeric column via an RPC, with an
 * optimistic bump that rolls back on error.
 *
 * @example
 * ```tsx
 * const { mutate } = useIncrementColumn()
 * mutate({ table: 'todos', id, column: 'priority', amount: 2 })
 * ```
 */
export function useIncrementColumn() {
  return useAdjustColumn(1)
}
