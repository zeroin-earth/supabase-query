import { getDeviceTokensQuery } from './queryOptions'
import type { DeviceToken, PushQueryOptions, ResolvedPushConfig } from './types'
import { CANONICAL_PUSH_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Lists the **current user's** registered device tokens (`device_tokens`,
 * RLS-scoped to `auth.uid()`). Useful to show/manage a user's devices, and the
 * key the register/unregister mutations invalidate.
 *
 * @example
 * ```tsx
 * const { tokens, total } = useDeviceTokens()
 * ```
 *
 * @param opts - Optional TanStack query options.
 * @param config - Resolved push config (injected by `makePushHooks`).
 * @returns The query result plus `tokens` and `total` accessors.
 */
export function useDeviceTokens(
  opts: PushQueryOptions = {},
  config: ResolvedPushConfig = CANONICAL_PUSH_CONFIG,
) {
  const { supabase } = useSupabase()
  const result = useQuery<{ total: number; tokens: DeviceToken[] }, SupabaseException>({
    ...getDeviceTokensQuery(supabase, config),
    ...opts,
  })
  return { ...result, tokens: result.data?.tokens, total: result.data?.total }
}
