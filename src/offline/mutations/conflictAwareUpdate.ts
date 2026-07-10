import { patchRowInLists, rowKeyOf } from '../../db/optimisticRows'
import type { Row, UpdateRowVariables } from '../../db/types'
import { resolveConflict } from '../conflictResolution/resolve'
import type { ConflictStrategy } from '../conflictResolution/types'
import type { MutationFn } from '../types'

/**
 * Creates a conflict-aware mutationFn for row updates.
 *
 * When a base snapshot is available (persisted in `MutationState.context` by
 * `useUpdateRow`'s onMutate), the function fetches the current remote row, runs
 * the configured conflict resolution strategy, and writes the resolved patch. If
 * no base snapshot exists (e.g. the mutation was created while online and ran
 * immediately), it falls through to a plain update.
 *
 * The settled row is written into the single-row cache *and* every cached list.
 * On a restart replay this runs as a bare `mutationFn` default — `onSettled`, and
 * so the usual list invalidation, is not registered — meaning the lists would
 * otherwise keep showing the pre-replay optimistic values.
 *
 * Unlike the Appwrite version there is no `JSON.parse(document.data)` unwrap —
 * a Supabase row is already a plain column object.
 *
 * `conflictStrategy` defaults to `last-write-wins`, matching
 * {@link hydrateMutationDefaults}. `useUpdateRow` reads it off the mutation meta,
 * which only `createOfflineClient` sets — without the default, a plain
 * `QueryClient` would resolve to `undefined` and PATCH an empty body.
 */
export function conflictAwareUpdate(
  conflictStrategy: ConflictStrategy = 'last-write-wins',
): MutationFn {
  return async (supabase, variables, queryClient) => {
    const { table, schema = 'public', id, values } = variables as unknown as UpdateRowVariables

    // Look up the mutation instance to read the persisted onMutate context.
    const mutation = queryClient
      .getMutationCache()
      .getAll()
      .find((m) => JSON.stringify(m.state.variables) === JSON.stringify(variables))

    const baseSnapshot = (mutation?.state.context as { baseSnapshot?: Record<string, unknown> })
      ?.baseSnapshot

    const target = { schema, table, id }
    let resolvedData = values as Record<string, unknown>

    if (baseSnapshot) {
      const { data: remote, error: fetchError } = await supabase
        .from(table)
        .select()
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      // Build the "local" row: the base with the user's changes applied.
      const local = { ...baseSnapshot, ...(values as Record<string, unknown>) }

      const result = resolveConflict(
        {
          base: baseSnapshot,
          remote: (remote ?? {}) as Record<string, unknown>,
          local,
          mutationKey: [schema, table, id],
        },
        conflictStrategy,
      )

      if (result === 'abort') {
        queryClient.setQueryData(rowKeyOf(target), remote)
        patchRowInLists(queryClient, target, (remote ?? {}) as Row)
        return remote
      }

      resolvedData = result
    }

    const { data, error } = await supabase
      .from(table)
      .update(resolvedData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    queryClient.setQueryData(rowKeyOf(target), data)
    patchRowInLists(queryClient, target, data as Row)
    return data
  }
}
