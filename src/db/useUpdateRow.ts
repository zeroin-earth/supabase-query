import { onlineManager } from '@tanstack/react-query'

import { cancelRowQueries, findCachedRow, patchRow, rowKeyOf } from './optimisticRows'
import type { Row, RowMutationContext, UpdateRowVariables } from './types'
import type { ConflictStrategy } from '../offline/conflictResolution/types'
import { conflictAwareUpdate } from '../offline/mutations/conflictAwareUpdate'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/** Applies a partial update and returns the updated row. Standalone for the
 * offline registry (P5). */
export async function updateRowFn<TRow extends Row = Row>(
  supabase: AnySupabaseClient,
  { table, id, values }: UpdateRowVariables,
): Promise<TRow> {
  const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single()
  if (error) throw error
  return data as TRow
}

/**
 * Mutation hook to patch a row with optimistic updates. Only the columns in
 * `values` change (partial update); the optimistic patch is rolled back on
 * error. On settle, the table's row lists are invalidated.
 *
 * The patch lands in the single-row cache *and* in every cached `useRows` list
 * holding the row. Lists are the usual thing a screen renders, and a paused
 * (offline) mutation never reaches `onSettled` to invalidate them — so patching
 * only the row key would leave an offline edit invisible until reconnect.
 *
 * **Offline conflict resolution:** `onMutate` captures a `baseSnapshot` of the
 * row and records whether the app was offline. When such a mutation resumes
 * (in-session) or is replayed after restart, the update is routed through
 * {@link conflictAwareUpdate}, which fetches the current remote row and applies
 * the configured `conflictStrategy` (offline engine, migration plan §6.5).
 *
 * @typeParam TRow - The updated row's shape.
 * @typeParam TUpdate - The patch payload shape.
 */
export function useUpdateRow<TRow extends Row = Row, TUpdate extends Row = Row>() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<TRow, SupabaseException, UpdateRowVariables<TUpdate>, RowMutationContext>({
    mutationKey: Keys.schema().table('').rows().update(),
    mutationFn: async (variables, ctx) => {
      // `willPerformOfflineMutation` is stashed on the shared mutation context by
      // onMutate when it ran while offline; by the time this fn resumes we are
      // back online, so the flag (not the live network state) is what tells us to
      // resolve conflicts. Clean it off the meta once read.
      const wasOffline = (ctx.meta?.willPerformOfflineMutation as boolean | undefined) ?? false
      if (ctx.meta?.willPerformOfflineMutation != null) {
        delete ctx.meta.willPerformOfflineMutation
      }

      if (wasOffline) {
        // `conflictStrategy` is only on the meta when the client came from
        // `createOfflineClient`; conflictAwareUpdate defaults it otherwise.
        return (await conflictAwareUpdate(
          ctx.meta?.conflictStrategy as ConflictStrategy | undefined,
        )(supabase, variables, queryClient)) as TRow
      }

      return updateRowFn<TRow>(supabase, variables)
    },
    onMutate: async (variables, ctx) => {
      const { table, schema = 'public', id, values } = variables
      const target = { schema, table, id }
      const rowKey = rowKeyOf(target)
      await cancelRowQueries(queryClient, target)
      const previousEntries = queryClient.getQueriesData({ queryKey: rowKey })

      // Deep-copy the current row as the "base" for three-way conflict
      // resolution. Persisted through dehydration into the mutation context.
      // Only the row itself is snapshotted, never the lists — a paused mutation's
      // context is persisted, and whole list arrays would bloat storage.
      const base = findCachedRow(queryClient, target)
      const baseSnapshot = base
        ? (JSON.parse(JSON.stringify(base)) as Record<string, unknown>)
        : undefined

      patchRow(queryClient, target, values as Row)

      const willPerformOfflineMutation = onlineManager.isOnline() === false
      ctx.meta = { ...ctx.meta, willPerformOfflineMutation }

      return { previousEntries, rowKey, baseSnapshot, willPerformOfflineMutation }
    },
    onError: (_error, { table, schema = 'public', id }, context) => {
      for (const [key, data] of context?.previousEntries ?? []) {
        queryClient.setQueryData(key, data)
      }
      // The lists weren't snapshotted, so undo by merging the pre-mutation row
      // back over the patched one. `baseSnapshot` holds every column, which
      // covers whichever ones `values` touched.
      if (context?.baseSnapshot) {
        patchRow(queryClient, { schema, table, id }, context.baseSnapshot)
      }
    },
    onSettled: (_data, _error, { table, schema = 'public' }) => {
      void queryClient.invalidateQueries({
        queryKey: Keys.schema(schema).table(table).rows().key(),
      })
    },
  })
}
