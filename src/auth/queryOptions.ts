import type { Session, User } from '@supabase/supabase-js'

import { Keys } from '../query/Keys'
import type { AnySupabaseClient } from '../types'

/**
 * Query config for the current authenticated user, cached under
 * `Keys.auth().key()` — the same key the provider's `onAuthStateChange`
 * subscription writes (see `authState.ts`), so {@link useUser} stays reactive
 * without polling.
 *
 * Reads the local session first and returns `null` when logged out, so a missing
 * session is a normal "no user" state rather than a thrown error. When a session
 * exists it calls `auth.getUser()` to validate it against GoTrue.
 */
export function getUserQuery(supabase: AnySupabaseClient) {
  return {
    queryKey: Keys.auth().key(),
    queryFn: async (): Promise<User | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return null

      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      return data.user
    },
    retry: false,
  }
}

/**
 * Query config for the current session (access/refresh tokens + user). `null`
 * when logged out. `getSession()` reads from local storage and refreshes if
 * needed — no network round-trip in the common case.
 */
export function getSessionQuery(supabase: AnySupabaseClient) {
  return {
    queryKey: Keys.auth().session(),
    queryFn: async (): Promise<Session | null> => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session
    },
    retry: false,
  }
}
