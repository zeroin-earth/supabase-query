import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { AsyncStorage, Persister } from '@tanstack/query-persist-client-core'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { onlineManager, QueryClient } from '@tanstack/react-query'

import type { ConflictStrategy } from './conflictResolution/types'
import { hydrateMutationDefaults } from './mutations/registry'
import type { NetworkAdapter } from './types'
import { createSupabaseClient } from '../client'
import type { AnySupabaseClient, KVStorage } from '../types'

export type OfflineClient = {
  supabase: AnySupabaseClient
  queryClient: QueryClient
  persister: Persister | undefined

  /**
   * Start persistence for non-React (imperative) usage.
   * Restores the persisted cache, subscribes to future changes,
   * and replays any paused mutations once the cache is restored.
   *
   * @returns `unsubscribe` to stop persisting and `restored` which resolves
   *          when the cache has been rehydrated from storage.
   * @throws  If no persister was configured via `storage` or `persister`.
   */
  startPersistence: () => { unsubscribe: () => void; restored: Promise<void> }

  conflictStrategy?: ConflictStrategy
}

const dehydrateOptions = {
  shouldDehydrateMutation: (mutation: { state: { isPaused: boolean } }) => mutation.state.isPaused,
  shouldDehydrateQuery: (query: { state: { status: string } }) => query.state.status === 'success',
}

/**
 * Creates an offline-capable Supabase client with a pre-configured QueryClient.
 *
 * Persistence can be configured in three ways:
 * - **Batteries-included**: pass `storage` (an `AsyncStorage` interface) and
 *   the factory builds a TanStack persister automatically.
 * - **Bring your own**: pass a pre-built `persister` (TanStack `Persister`
 *   interface) — e.g. one backed by SQLite, etc.
 * - **No persistence**: omit both — you still get offline mutation queuing
 *   and network state management.
 *
 * For React apps, pass `client.queryClient` and `client.persister` to
 * `<SupabaseProvider queryClient={…} persister={…}>`. For non-React (imperative)
 * usage, call `client.startPersistence()`.
 *
 * Only *data* mutations (rows) are offline-queueable — auth mutations run through
 * GoTrue, which is inherently online, and are intentionally not in the replay
 * registry (migration plan §6.5).
 */
export function createOfflineClient({
  url,
  anonKey,
  authStorage,
  isNative = false,
  storage,
  persister: externalPersister,
  networkAdapter,
  throttleTime = 1000,
  conflictStrategy = 'last-write-wins',
}: {
  url: string
  anonKey: string
  /** React Native: pass `AsyncStorage` so GoTrue persists the auth session. */
  authStorage?: KVStorage
  /** Set `true` on React Native to disable URL-based session detection. */
  isNative?: boolean
  /** Batteries-included: provide a simple getItem/setItem/removeItem storage. */
  storage?: AsyncStorage
  /** BYOP: provide a pre-built TanStack Persister. */
  persister?: Persister
  networkAdapter: NetworkAdapter
  /** Throttle time for network status changes to prevent rapid toggling. Default: 1000ms. */
  throttleTime?: number
  conflictStrategy?: ConflictStrategy
}): OfflineClient {
  if (storage && externalPersister) {
    throw new Error('Provide either `storage` or `persister`, not both.')
  }

  const { supabase } = createSupabaseClient({ url, anonKey, authStorage, isNative })

  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        networkMode: 'offlineFirst',
        meta: {
          conflictStrategy,
        },
      },
      queries: { networkMode: 'offlineFirst', gcTime: 1000 * 60 * 60 * 24 },
    },
  })

  hydrateMutationDefaults(queryClient, supabase, { conflictStrategy })

  const persister =
    externalPersister ??
    (storage
      ? createAsyncStoragePersister({
          storage,
          key: 'supabase-query-offline-cache',
          throttleTime,
        })
      : undefined)

  networkAdapter.listen((isOnline) => {
    onlineManager.setOnline(isOnline)
  })

  return {
    supabase,
    queryClient,
    persister,
    startPersistence() {
      if (!persister) {
        throw new Error(
          'No persister configured. Provide `storage` or `persister` to createOfflineClient.',
        )
      }

      const [unsubscribe, restored] = persistQueryClient({
        queryClient,
        persister,
        dehydrateOptions,
      })

      const restoredWithResume = restored.then(() => {
        void queryClient.resumePausedMutations()
      })

      return { unsubscribe, restored: restoredWithResume }
    },
    conflictStrategy,
  }
}
