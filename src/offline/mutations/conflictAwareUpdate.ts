import type { UpdateRowVariables } from '../../db/types'
import { Keys } from '../../query/Keys'
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
 * Unlike the Appwrite version there is no `JSON.parse(document.data)` unwrap —
 * a Supabase row is already a plain column object.
 */
export function conflictAwareUpdate(conflictStrategy: ConflictStrategy): MutationFn {
  return async (supabase, variables, queryClient) => {
    const { table, schema = 'public', id, values } = variables as unknown as UpdateRowVariables

    // Look up the mutation instance to read the persisted onMutate context.
    const mutation = queryClient
      .getMutationCache()
      .getAll()
      .find((m) => JSON.stringify(m.state.variables) === JSON.stringify(variables))

    const baseSnapshot = (mutation?.state.context as { baseSnapshot?: Record<string, unknown> })
      ?.baseSnapshot

    const rowKey = Keys.schema(schema).table(table).row(id).key()
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
        queryClient.setQueryData(rowKey, remote)
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

    queryClient.setQueryData(rowKey, data)
    return data
  }
}
