import type { AnySupabaseClient } from '../types'

// The Edge Function types below are derived from the live `supabase.functions`
// API so they track the installed `@supabase/functions-js` version without
// importing that transitive package (mirrors how `storage/types.ts` derives its
// types). Postgres RPC (`.rpc()`) is typed separately, from the consumer's
// generated `Database['public']['Functions']`, in `factory.ts`.

/** The Edge Functions client: `supabase.functions`. */
type FunctionsClient = AnySupabaseClient['functions']

/** Options accepted by `supabase.functions.invoke` — `body`, `headers`, `method`, `region`. */
export type InvokeOptions = NonNullable<Parameters<FunctionsClient['invoke']>[1]>

/**
 * Variables for {@link useFunction}: the deployed Edge Function `name` plus the
 * invoke options. Unlike Appwrite's `functionId` + serialized JSON body, the
 * body is passed as a plain value and supabase-js serializes it.
 */
export type FunctionVariables = {
  /** The deployed Edge Function name, e.g. `'send-push'`. */
  name: string
} & InvokeOptions

/**
 * Arguments accepted by a Postgres RPC (`supabase.rpc(name, args)`). When the
 * consumer passes a real `Database`, the factory narrows this to the function's
 * generated `Args` type; untyped it is a permissive record.
 */
export type RpcArgs = Record<string, unknown>
