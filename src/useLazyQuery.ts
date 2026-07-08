import type {
  DefinedInitialDataOptions,
  QueryKey,
  UndefinedInitialDataOptions,
  UseQueryOptions,
} from '@tanstack/react-query'
import { useQuery as useReactQuery } from '@tanstack/react-query'

import type { SupabaseException } from './types'
import { useQueryClient } from './useQueryClient'

/**
 * Like {@link useQuery}, but the query is disabled by default and only runs when `run()` is called.
 * @returns `{ run, query }` — `run` triggers the fetch, `query` contains the standard query result.
 */
export function useLazyQuery<
  TQueryFnData = unknown,
  TError = SupabaseException,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options:
    | UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>
    | DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>
    | UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
) {
  const queryClient = useQueryClient()
  const query = useReactQuery<TQueryFnData, TError, TData, TQueryKey>(
    { ...options, enabled: false },
    queryClient,
  )

  return { run: query.refetch, query }
}
