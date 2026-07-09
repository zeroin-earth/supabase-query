import type { RpcArgs } from './types'
import { useFunction, useSuspenseFunction } from './useFunction'
import { useCallRpc as useCallRpcBase, useRpc as useRpcBase } from './useRpc'
import type { AnyDatabase, QueryOptions } from '../types'

// --- Schema-driven RPC type helpers ------------------------------------------
// These infer function names + arg/return shapes from the consumer's generated
// `Database['public']['Functions']`. When `Database` is the permissive
// `AnyDatabase`, they collapse to `string`/`RpcArgs`/`unknown`, keeping the
// untyped path working (mirrors the `db/` factory's table helpers).

type FunctionsOf<DB> = DB extends { public: { Functions: infer F } } ? F : never
type FnName<DB> = keyof FunctionsOf<DB> & string
type ArgsOf<DB, F extends FnName<DB>> = FunctionsOf<DB>[F] extends { Args: infer A }
  ? A & RpcArgs
  : RpcArgs
type ReturnsOf<DB, F extends FnName<DB>> = FunctionsOf<DB>[F] extends { Returns: infer R }
  ? R
  : unknown

/**
 * Builds the `functions/` hook set returned by `createSupabaseQuery`.
 *
 * The Postgres RPC hooks ({@link useRpc}/{@link useCallRpc}) are `Database`-typed:
 * function names autocomplete and arg/return types infer from the generated
 * `Functions` schema. `useFunction`/`useSuspenseFunction` (Edge Functions) are
 * **not** schema-typed — Edge Functions are runtime resources addressed by name,
 * not part of the Postgres schema — so they are bundled as-is (like the storage
 * hooks). The caller may still supply the response type via `useFunction<T>()`.
 * @internal
 */
export function makeFunctionHooks<Database = AnyDatabase>() {
  type F = FnName<Database>

  return {
    useFunction,
    useSuspenseFunction,

    /** Call a read-only Postgres function: `useRpc('places_within', args)`. */
    useRpc<Fn extends F>(name: Fn, args?: ArgsOf<Database, Fn>, opts?: QueryOptions) {
      return useRpcBase<ReturnsOf<Database, Fn>>(name, args, opts)
    },

    /** Call a mutating Postgres function: `useCallRpc('increment_column'); mutate(args)`. */
    useCallRpc<Fn extends F>(name: Fn) {
      return useCallRpcBase<ReturnsOf<Database, Fn>, ArgsOf<Database, Fn>>(name)
    },
  }
}
