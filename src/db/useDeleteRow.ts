import {
  cancelRowQueries,
  findCachedRow,
  reinsertRowIntoLists,
  removeRowFromLists,
  rowKeyOf,
} from './optimisticRows'
import type { DeleteRowVariables, RowMutationContext } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/** Deletes a row by id. Standalone for the offline registry (P5). */
export async function deleteRowFn(
  supabase: AnySupabaseClient,
  { table, id }: DeleteRowVariables,
): Promise<{ id: string }> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  return { id }
}

/**
 * Mutation hook to delete a row with optimistic removal. The row disappears from
 * the single-row cache and from every cached list immediately, and is restored to
 * its original position on error. On settle, the row's queries are removed and
 * the table's row lists invalidated.
 *
 * Removing it from the lists is what makes the deletion visible: screens render
 * lists, and a paused (offline) mutation never reaches `onSettled` to invalidate
 * them.
 */
export function useDeleteRow() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<{ id: string }, SupabaseException, DeleteRowVariables, RowMutationContext>({
    mutationKey: Keys.schema().table('').rows().delete(),
    mutationFn: (variables) => deleteRowFn(supabase, variables),
    onMutate: async ({ table, schema = 'public', id }) => {
      const target = { schema, table, id }
      const rowKey = rowKeyOf(target)
      await cancelRowQueries(queryClient, target)

      const previousEntries = queryClient.getQueriesData({ queryKey: rowKey })
      const removedRow = findCachedRow(queryClient, target)

      queryClient.removeQueries({ queryKey: rowKey })
      const removedPositions = removeRowFromLists(queryClient, target)

      return { previousEntries, rowKey, removedRow, removedPositions }
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previousEntries ?? []) {
        queryClient.setQueryData(key, data)
      }
      if (context?.removedRow && context.removedPositions) {
        reinsertRowIntoLists(queryClient, context.removedPositions, context.removedRow)
      }
    },
    onSettled: (_data, _error, { table, schema = 'public', id }) => {
      queryClient.removeQueries({ queryKey: Keys.schema(schema).table(table).row(id).key() })
      void queryClient.invalidateQueries({
        queryKey: Keys.schema(schema).table(table).rows().key(),
      })
    },
  })
}
