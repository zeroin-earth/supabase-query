import type { User } from '@supabase/supabase-js'

import { getUserQuery } from './queryOptions'
import type { QueryOptions, SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'
import { useSuspenseQuery } from '../useSuspenseQuery'

/**
 * Returns the current authenticated user, or `null` when logged out.
 *
 * Reads the same cache key the provider's `onAuthStateChange` subscription
 * writes, so it updates reactively on login / logout / token refresh with no
 * polling — a genuine upgrade over the Appwrite realtime-account flow. This is
 * the successor to Appwrite's `useAccount`.
 *
 * @example
 * ```tsx
 * const { user, isLoading } = useUser()
 * ```
 *
 * @param opts - Optional TanStack query options.
 * @returns The query result plus a `user` accessor (`User | null`).
 */
export function useUser(opts: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const result = useQuery<User | null, SupabaseException>({ ...getUserQuery(supabase), ...opts })
  return { ...result, user: result.data ?? null }
}

/**
 * Suspense variant of {@link useUser}. Suspends until the initial user load
 * resolves; thereafter `user` may still be `null` (logged out).
 */
export function useSuspenseUser(opts: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const result = useSuspenseQuery<User | null, SupabaseException>({
    ...getUserQuery(supabase),
    ...opts,
  })
  return { ...result, user: result.data ?? null }
}
