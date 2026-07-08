import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'

import { Keys } from './query/Keys'
import type { AnySupabaseClient } from './types'

/**
 * Query key under which the current auth user is cached.
 *
 * P6's `useUser` reads this same key, and the provider's `onAuthStateChange`
 * subscription writes it — that is what makes `useUser` reactive without
 * polling. Derived from `Keys.auth()` so the two can never drift.
 */
export const AUTH_USER_QUERY_KEY = Keys.auth().key()

/** Query key under which the current session is cached — read by `useSession`
 * and written by the same subscription, so it is reactive like the user key. */
export const AUTH_SESSION_QUERY_KEY = Keys.auth().session()

/**
 * Subscribes to GoTrue auth-state changes and mirrors the current user and
 * session into the TanStack cache, so any component reading
 * {@link AUTH_USER_QUERY_KEY} / {@link AUTH_SESSION_QUERY_KEY} stays in sync with
 * login/logout/token-refresh (no polling). On `SIGNED_OUT` the whole cache is
 * cleared to drop per-user data. Wired into both providers.
 */
export function useAuthStateSync(supabase: AnySupabaseClient, queryClient: QueryClient) {
  React.useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        return
      }
      queryClient.setQueryData(AUTH_USER_QUERY_KEY, session?.user ?? null)
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase, queryClient])
}
