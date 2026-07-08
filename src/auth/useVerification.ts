import type { Session } from '@supabase/supabase-js'

import type { ResendVariables, VerificationVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Email confirmation in two mutations.
 *
 * - `verify` — confirms an email using either the 6-digit code (`{ email, token,
 *   type }`) or the link's `tokenHash` (`{ tokenHash, type }`), where `type` is
 *   `'signup'`, `'email_change'`, etc. Returns the resulting {@link Session}.
 * - `resend` — re-sends the confirmation email (`auth.resend`) for `'signup'` /
 *   `'email_change'` (or SMS for `'sms'` / `'phone_change'`).
 *
 * Replaces Appwrite's `accountCreateVerification` + update. On success the
 * provider's `onAuthStateChange` mirrors the confirmed user into the cache.
 *
 * @example
 * ```tsx
 * const { verify, resend } = useVerification()
 * verify.mutate({ type: 'signup', email, token: '123456' })
 * resend.mutate({ type: 'signup', email })
 * ```
 */
export function useVerification() {
  const { supabase } = useSupabase()

  const verify = useMutation<Session, SupabaseException, VerificationVariables>({
    mutationKey: Keys.auth().verification().update(),
    mutationFn: async (variables) => {
      const { data, error } =
        'tokenHash' in variables
          ? await supabase.auth.verifyOtp({ token_hash: variables.tokenHash, type: variables.type })
          : await supabase.auth.verifyOtp({
              email: variables.email,
              token: variables.token,
              type: variables.type,
            })
      if (error) throw error
      return data.session as Session
    },
  })

  const resend = useMutation<void, SupabaseException, ResendVariables>({
    mutationKey: Keys.auth().verification().create(),
    mutationFn: async (variables) => {
      const { error } =
        'email' in variables
          ? await supabase.auth.resend({
              type: variables.type,
              email: variables.email,
              options: { emailRedirectTo: variables.emailRedirectTo },
            })
          : await supabase.auth.resend({ type: variables.type, phone: variables.phone })
      if (error) throw error
    },
  })

  return { verify, resend }
}
