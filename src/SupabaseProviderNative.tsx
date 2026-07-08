import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'

import { useAuthStateSync } from './authState'
import { SupabaseContext } from './context'
import type { SupabaseProviderProps } from './SupabaseProvider'

const defaultQueryClient = new QueryClient()

/**
 * React Native provider — identical to {@link SupabaseProvider} but without the
 * web-only React Query Devtools. Pass `AsyncStorage` as `kvStorage` (and to the
 * client's `authStorage`) so sessions and the offline cache persist natively.
 *
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage'
 *
 * <SupabaseProvider client={client} kvStorage={AsyncStorage}>
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
      </PersistQueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={qc}>
      <SupabaseContext.Provider value={contextValue}>{children}</SupabaseContext.Provider>
    </QueryClientProvider>
  )
}
