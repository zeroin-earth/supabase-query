// The `functions/` module: Edge Function invocation (`supabase.functions.invoke`)
// and Postgres RPC calls (`supabase.rpc`), migration plan §6.3/§6.4. Also
// available fully wired via the `createSupabaseQuery` factory
// (`makeFunctionHooks`). The RPC hooks are `Database`-typed through the factory;
// `useFunction` is not (Edge Functions are runtime-addressed by name).

export { useFunction, useSuspenseFunction } from './useFunction'
export { useCallRpc, useRpc } from './useRpc'
export type { FunctionVariables, InvokeOptions, RpcArgs } from './types'
