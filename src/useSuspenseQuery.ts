import type { QueryKey, UseSuspenseQueryOptions } from '@tanstack/react-query'
import { useSuspenseQuery as useSuspenseReactQuery } from '@tanstack/react-query'

import type { SupabaseException } from './types'
import { useQueryClient } from './useQueryClient'

/**
 * Wrapper around TanStack Query's `useSuspenseQuery` that automatically injects the Supabase-managed `QueryClient`.
 * Suspends the component while loading. Use with React Suspense boundaries.
 */
export function useSuspenseQuery<
  TQueryFnData = unknown,
  TError = SupabaseException,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>) {
  const queryClient = useQueryClient()
  return useSuspenseReactQuery<TQueryFnData, TError, TData, TQueryKey>(options, queryClient)
}
