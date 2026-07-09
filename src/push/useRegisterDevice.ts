import type { DeviceToken, RegisterDeviceVariables, ResolvedPushConfig } from './types'
import { CANONICAL_PUSH_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Registers (or refreshes) the current device's push token by upserting a
 * `device_tokens` row. Call it **after login** and again whenever the platform
 * hands you a new token (Expo/FCM rotate them).
 *
 * The library sets `user_id` from the active session (RLS requires
 * `auth.uid() = user_id`), so the caller supplies only `{ token, platform,
 * provider }`. Acquiring the token is the app's job (a peer concern): native via
 * `expo-notifications` `getExpoPushTokenAsync()` (`provider: 'expo'`), web via
 * Firebase `getToken({ vapidKey })` (`provider: 'fcm'`) — neither is bundled.
 *
 * **Online-only:** device-token registration is low-value offline and needs a
 * live session, so it stays out of the offline replay queue.
 *
 * @example
 * ```tsx
 * const { mutate } = useRegisterDevice()
 * mutate({ token, platform: 'ios', provider: 'expo' })
 * ```
 */
export function useRegisterDevice(config: ResolvedPushConfig = CANONICAL_PUSH_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<DeviceToken, SupabaseException, RegisterDeviceVariables>({
    mutationKey: Keys.push().deviceTokens().create(),
    networkMode: 'online',
    mutationFn: async ({ token, platform, provider }) => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('useRegisterDevice: no authenticated user')

      const { data, error } = await supabase
        .from(config.table)
        .upsert(
          { user_id: user.id, token, platform, provider },
          { onConflict: 'user_id,token' },
        )
        .select()
        .single()
      if (error) throw error
      return data as DeviceToken
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: Keys.push().deviceTokens().key() })
    },
  })
}
