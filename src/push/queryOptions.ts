import type { DeviceToken, ResolvedPushConfig } from './types'
import { CANONICAL_PUSH_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient } from '../types'

/**
 * Query config for the current user's registered device tokens
 * (`device_tokens`, RLS-scoped to `auth.uid()`). Cached under
 * `Keys.push().deviceTokens()` — the key the register/unregister mutations
 * invalidate. Returns `{ total, tokens }` (exact count) mirroring the other
 * list reads.
 */
export function getDeviceTokensQuery(
  supabase: AnySupabaseClient,
  config: ResolvedPushConfig = CANONICAL_PUSH_CONFIG,
) {
  return {
    queryKey: Keys.push().deviceTokens().key(),
    queryFn: async (): Promise<{ total: number; tokens: DeviceToken[] }> => {
      const { data, error, count } = await supabase
        .from(config.table)
        .select('*', { count: 'exact' })
      if (error) throw error
      return { total: count ?? 0, tokens: (data ?? []) as DeviceToken[] }
    },
  }
}
