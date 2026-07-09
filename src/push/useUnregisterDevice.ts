import type { ResolvedPushConfig, UnregisterDeviceVariables } from './types'
import { CANONICAL_PUSH_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Unregisters the current device's push token by deleting its `device_tokens`
 * row. Call it **on logout** (and when the app disables notifications). RLS
 * ("own tokens") scopes the delete to the caller, so only the token string is
 * needed.
 *
 * **Online-only:** stays out of the offline replay queue (see
 * {@link useRegisterDevice}).
 *
 * @example
 * ```tsx
 * const { mutate } = useUnregisterDevice()
 * mutate({ token })
 * ```
 */
export function useUnregisterDevice(config: ResolvedPushConfig = CANONICAL_PUSH_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<void, SupabaseException, UnregisterDeviceVariables>({
    mutationKey: Keys.push().deviceTokens().delete(),
    networkMode: 'online',
    mutationFn: async ({ token }) => {
      const { error } = await supabase.from(config.table).delete().eq('token', token)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: Keys.push().deviceTokens().key() })
    },
  })
}
