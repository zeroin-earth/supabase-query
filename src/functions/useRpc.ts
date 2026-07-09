import type { RpcArgs } from './types'
import { Keys } from '../query/Keys'
import type { QueryOptions, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Calls a **Postgres function** as a read (`supabase.rpc(name, args)` wrapped in
 * `useQuery`). RPC is the escape hatch for anything PostgREST can't express —
 * aggregates, spatial predicates (the PostGIS `distance*` methods route here,
 * migration plan §5/§8.7), and other read-only SQL functions.
 *
 * Use this for functions that only read; for functions that mutate (increment,
 * atomic multi-step ops that replaced Appwrite transactions) use
 * {@link useCallRpc}, and for Edge Functions use {@link useFunction}.
 *
 * @example
 * ```tsx
 * const { data } = useRpc('places_within', { p_lat, p_lng, p_meters: 1000 })
 * ```
 *
 * @typeParam TReturns - The function's return type (defaults to `unknown`).
 * @param name - The Postgres function name.
 * @param args - The function arguments.
 * @param opts - Optional TanStack query options.
 */
export function useRpc<TReturns = unknown>(name: string, args?: RpcArgs, opts: QueryOptions = {}) {
  const { supabase } = useSupabase()

  return useQuery<TReturns, SupabaseException>({
    queryKey: [...Keys.function(name).key(), 'rpc', args ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      return data as TReturns
    },
    ...opts,
  })
}

/**
 * Calls a **Postgres function** as a mutation (`supabase.rpc(name, args)` wrapped
 * in `useMutation`). This is the replacement for Appwrite staged transactions and
 * the increment/decrement attribute APIs: model the atomic operation as a SQL
 * function and invoke it here (migration plan §6.4). The `db/` increment/decrement
 * hooks are thin wrappers over this pattern.
 *
 * @example
 * ```tsx
 * const { mutate } = useCallRpc('increment_column')
 * mutate({ p_table: 'todos', p_id: id, p_column: 'views', p_amount: 1 })
 * ```
 *
 * @typeParam TReturns - The function's return type (defaults to `unknown`).
 * @typeParam TArgs - The function's argument shape.
 * @param name - The Postgres function name.
 * @returns A `UseMutationResult`; call `mutate(args)`.
 */
export function useCallRpc<TReturns = unknown, TArgs extends RpcArgs = RpcArgs>(name: string) {
  const { supabase } = useSupabase()

  return useMutation<TReturns, SupabaseException, TArgs>({
    mutationKey: [...Keys.function(name).key(), 'rpc'],
    mutationFn: async (args) => {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      return data as TReturns
    },
  })
}
