import type { MagicLinkVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Sends a passwordless magic-link email. The user completes sign-in by clicking
 * the link, which returns them to `emailRedirectTo` with an active session.
 *
 * Replaces Appwrite's `accountCreateMagicURLToken`. For the code-entry variant
 * (enter a 6-digit OTP instead of clicking a link), use {@link useEmailOtp}.
 *
 * @example
 * ```tsx
 * const { mutate } = useMagicLink()
 * mutate({ email, emailRedirectTo: 'https://example.com/welcome' })
 * ```
 */
export function useMagicLink() {
  const { supabase } = useSupabase()

  return useMutation<void, SupabaseException, MagicLinkVariables>({
    mutationKey: Keys.auth().magicLink().create(),
    mutationFn: async ({ email, emailRedirectTo, shouldCreateUser }) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo, shouldCreateUser },
      })
      if (error) throw error
    },
  })
}
