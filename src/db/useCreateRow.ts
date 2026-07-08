import type { CreateRowVariables, Row } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/** Inserts a row and returns it. Standalone so the offline registry (P5) can
 * replay it from persisted variables. */
export async function createRowFn<TRow extends Row = Row>(
  supabase: AnySupabaseClient,
  { table, values }: CreateRowVariables,
): Promise<TRow> {
  const { data, error } = await supabase.from(table).insert(values).select().single()
  if (error) throw error
  return data as TRow
}

/**
 * Mutation hook to insert a row. On success, seeds the new row into its
 * single-row cache key and invalidates the table's row lists.
 *
 * Unlike Appwrite there is no `permissions` argument — access is governed by RLS
 * policies (migration plan §8.4). The row `id` is assigned by the DB default
 * (`gen_random_uuid()`); you need not supply one.
 *
 * @typeParam TRow - The inserted row's shape (returned by the DB).
 * @typeParam TInsert - The insert payload shape.
 */
export function useCreateRow<TRow extends Row = Row, TInsert extends Row = Row>() {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<TRow, SupabaseException, CreateRowVariables<TInsert>>({
    mutationKey: Keys.schema().table('').rows().create(),
    mutationFn: (variables) => createRowFn<TRow>(supabase, variables),
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
