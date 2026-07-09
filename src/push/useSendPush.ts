import type { ResolvedPushConfig, SendPushVariables } from './types'
import { CANONICAL_PUSH_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/** The `send-push` Edge Function's response (a per-provider send summary). */
export type SendPushResult = {
  /** Number of notifications accepted by the providers. */
  sent: number
  /** Tokens the providers reported as dead; the function prunes them. */
  pruned?: string[]
}

/**
 * Sends a push notification to a set of users by **invoking the `send-push`
 * Edge Function** (`supabase.functions.invoke`). The function looks up the
 * recipients' `device_tokens` with the service role, branches by provider (Expo
 * Push API for native, FCM HTTP v1 for web), and prunes dead tokens from the
 * providers' receipts.
 *
 * Most sends happen server-to-server; this hook exists for **authorized in-app
 * sends** (the function still authorizes the caller). Provider secrets never
 * reach the client — they live in the function's env (migration plan §6.6 /
 * §8.12).
 *
 * **Online-only** (Edge Function invoke) — out of the offline queue.
 *
 * @example
 * ```tsx
 * const { mutate } = useSendPush()
 * mutate({ userIds: [uid], title: 'Hi', body: 'You have a new message' })
 * ```
 */
export function useSendPush(config: ResolvedPushConfig = CANONICAL_PUSH_CONFIG) {
  const { supabase } = useSupabase()

  return useMutation<SendPushResult, SupabaseException, SendPushVariables>({
    mutationKey: Keys.push().send(),
    networkMode: 'online',
    mutationFn: async ({ userIds, title, body, data }) => {
      const { data: result, error } = await supabase.functions.invoke<SendPushResult>(
        config.fn.send,
        { body: { userIds, title, body, data } },
      )
      if (error) throw error
      return result as SendPushResult
    },
  })
}
