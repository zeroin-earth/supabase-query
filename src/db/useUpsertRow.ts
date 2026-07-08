import type { Row, UpsertRowVariables } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/** Upserts a row (insert or update on conflict) and returns it. Standalone for
 * the offline registry (P5). */
export async function upsertRowFn<TRow extends Row = Row>(
  supabase: AnySupabaseClient,
  { table, values, onConflict = 'id' }: UpsertRowVariables,
): Promise<TRow> {
  const { data, error } = await supabase
    .from(table)
    .upsert(values, { onConflict })
    .select()
    .single()
  if (error) throw error
  return data as TRow
}

/**
 * Mutation hook to upsert a row — inserts when absent, updates on conflict with
 * `onConflict` (default `'id'`). On success, seeds the row cache and invalidates
 * the table's row lists.
 *
 * @typeParam TRow - The upserted row's shape.
 * @typeParam TInsert - The upsert payload shape.
 */
export function useUpsertRow<TRow extends Row = Row, TInsert extends Row = Row>() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<TRow, SupabaseException, UpsertRowVariables<TInsert>>({
    mutationKey: Keys.schema().table('').rows().upsert(),
    mutationFn: (variables) => upsertRowFn<TRow>(supabase, variables),
    onSuccess: (row, { table, schema = 'public' }) => {
      const id = (row as { id?: unknown }).id
      if (id != null) {
        queryClient.setQueryData(Keys.schema(schema).table(table).row(String(id)).key(), row)
      }
      void queryClient.invalidateQueries({
        queryKey: Keys.schema(schema).table(table).rows().key(),
      })
    },
  })
}
