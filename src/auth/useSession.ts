import type { Session } from '@supabase/supabase-js'

import { getSessionQuery } from './queryOptions'
import type { QueryOptions, SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Returns the current session (tokens + user), or `null` when logged out.
 *
 * Use this when you need the `access_token` (e.g. to call an external service):
 * `session?.access_token`. Replaces Appwrite's `accountCreateJWT` — there is no
 * separate mint step; the session already carries the JWT.
 *
 * ⚠️ There is **no client API to list all sessions** — GoTrue exposes only the
 * current one. Listing/revoking other sessions is admin-only (migration plan §2).
 *
 * @example
 * ```tsx
 * const { session } = useSession()
 * const token = session?.access_token
 * ```
 */
export function useSession(opts: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const result = useQuery<Session | null, SupabaseException>({
    ...getSessionQuery(supabase),
    ...opts,
  })
  return { ...result, session: result.data ?? null }
}
