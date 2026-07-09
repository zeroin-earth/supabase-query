import type { FunctionVariables } from './types'
import { Keys } from '../query/Keys'
import type { QueryOptions, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'
import { useSuspenseQuery } from '../useSuspenseQuery'

/**
 * Invokes a Supabase **Edge Function** (`supabase.functions.invoke(name, opts)`),
 * the successor to Appwrite's `useFunction` / `functionsCreateExecution`.
 *
 * Because Supabase functions are invoked synchronously (the response is the
 * result — there is no separate execution record to poll), this is a single
 * mutation. Appwrite's `currentExecution` polling query and the
 * `useListExecutions`/`useGetExecution` hooks are **dropped** (no client API,
 * migration plan §6.3). For calling Postgres functions use {@link useRpc} /
 * {@link useCallRpc} instead.
 *
 * The `body` is passed as a plain value — supabase-js serializes it and parses a
 * JSON response back into an object; no manual `JSON.stringify`/`parse` as with
 * Appwrite.
 *
 * @example
 * ```tsx
 * const { mutate, data } = useFunction<{ sent: number }>()
 * mutate({ name: 'send-push', body: { userIds, title, body } })
 * ```
 *
 * @typeParam TData - The expected response shape (defaults to `unknown`).
 * @returns A `UseMutationResult`; `data` is the parsed function response.
 */
export function useFunction<TData = unknown>() {
  const { supabase } = useSupabase()

  return useMutation<TData, SupabaseException, FunctionVariables>({
    mutationKey: [...Keys.functions().key(), 'invoke'],
    mutationFn: async ({ name, ...options }) => {
      const { data, error } = await supabase.functions.invoke<TData>(name, options)
      if (error) throw error
      return data as TData
    },
  })
}

/**
 * Suspense variant of {@link useFunction}: invokes an Edge Function and suspends
 * until the response is available. Cached with `staleTime: Infinity` so
 * re-renders do not re-invoke; the query key includes `body`/`method` so
 * distinct calls cache separately.
 *
 * Prefer {@link useFunction} for side-effecting calls — this is for
 * read-like functions whose result you want to render directly.
 *
 * @example
 * ```tsx
 * const { data } = useSuspenseFunction<{ greeting: string }>({
 *   name: 'greet',
 *   body: { locale: 'en' },
 * })
 * ```
 *
 * @typeParam TData - The expected response shape (defaults to `unknown`).
 */
export function useSuspenseFunction<TData = unknown>(
  { name, ...options }: FunctionVariables,
  opts: Pick<QueryOptions, 'staleTime' | 'retry' | 'retryDelay'> = {},
) {
  const { supabase } = useSupabase()

  return useSuspenseQuery<TData, SupabaseException>({
    queryKey: [...Keys.function(name).key(), 'invoke', options.body ?? null, options.method ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<TData>(name, options)
      if (error) throw error
      return data as TData
    },
    staleTime: Infinity,
    ...opts,
  })
}
