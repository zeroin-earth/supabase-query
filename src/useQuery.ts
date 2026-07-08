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
 * Wrapper around TanStack Query's `useQuery` that automatically injects the Supabase-managed `QueryClient`.
 * Use this instead of importing `useQuery` from `@tanstack/react-query` directly.
 */
export function useQuery<
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
  return useReactQuery<TQueryFnData, TError, TData, TQueryKey>(options, queryClient)
}
