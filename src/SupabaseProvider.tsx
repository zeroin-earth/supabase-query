import * as React from 'react'
import { type ReactNode } from 'react'
import type { Persister } from '@tanstack/query-persist-client-core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'

import { useAuthStateSync } from './authState'
import type { SupabaseHooksClient } from './client'
import { SupabaseContext } from './context'
import type { KVStorage } from './types'

const defaultQueryClient = new QueryClient()

/** Props shared by the web and React Native providers. */
export type SupabaseProviderProps = {
  /** The client bundle from {@link createSupabaseClient} (or a hand-built one). */
  client: SupabaseHooksClient
  /** Optional custom `QueryClient`; a shared default is used otherwise. */
  queryClient?: QueryClient
  /**
   * Optional key-value storage adapter (e.g. `AsyncStorage` on React Native).
   * On web, `localStorage` is used automatically when omitted.
   */
  kvStorage?: KVStorage
  /** Optional TanStack `Persister` for offline cache persistence. */
  persister?: Persister
  /** Callback invoked after the persisted cache is restored. */
  onCacheRestored?: () => void
  children: ReactNode
}

/**
 * React context provider that supplies the Supabase client and `QueryClient` to
 * all child hooks. Must wrap any component using this library's hooks.
 *
 * Subscribes to `supabase.auth.onAuthStateChange` and mirrors the current user
 * into the query cache (see {@link useAuthStateSync}), so auth-aware hooks stay
 * reactive to login/logout without polling.
 *
 * @example
 * ```tsx
 * <SupabaseProvider client={client}>
 *   <App />
 * </SupabaseProvider>
 * ```
 */
export function SupabaseProvider({
  client,
  queryClient,
  kvStorage,
  persister,
  onCacheRestored,
  children,
}: SupabaseProviderProps) {
  const qc = queryClient ?? defaultQueryClient
  const contextValue = React.useMemo(
    () => ({ supabase: client.supabase, kvStorage }),
    [client, kvStorage],
  )

  useAuthStateSync(client.supabase, qc)

  if (persister) {
    return (
      <PersistQueryClientProvider
        client={qc}
        persistOptions={{
          persister,
          dehydrateOptions: {
            shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
            shouldDehydrateQuery: (query) => query.state.status === 'success',
          },
        }}
        onSuccess={() => {
          void qc.resumePausedMutations()
          onCacheRestored?.()
        }}
      >
        <SupabaseContext.Provider value={contextValue}>{children}</SupabaseContext.Provider>
        <ReactQueryDevtools initialIsOpen={false} />
      </PersistQueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={qc}>
      <SupabaseContext.Provider value={contextValue}>{children}</SupabaseContext.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
