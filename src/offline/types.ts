import type { QueryClient } from '@tanstack/react-query'

import type { AnySupabaseClient } from '../types'

export type NetworkAdapter = {
  listen: (callback: (isOnline: boolean) => void) => () => void
}

export type Vars = Record<string, unknown>

/**
 * The replay signature every registry entry conforms to. Unlike the Appwrite
 * version (which took the many-service `AppwriteClient`), this receives the one
 * Supabase client. Called both in-session (on resume of a paused mutation) and
 * after an app restart (via the registered mutation defaults — see
 * {@link hydrateMutationDefaults}).
 */
export type MutationFn = (
  client: AnySupabaseClient,
  variables: Vars,
  queryClient: QueryClient,
) => Promise<unknown>
