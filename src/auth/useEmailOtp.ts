import type { Session } from '@supabase/supabase-js'

import type { SendEmailOtpVariables, VerifyEmailOtpVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Email one-time-passcode login in two steps.
 *
 * - `send` — emails a 6-digit code (`signInWithOtp`). Set `shouldCreateUser:
 *   false` to reject unknown emails.
 * - `verify` — exchanges the code for a session (`verifyOtp`, `type: 'email'`).
 *
 * Replaces Appwrite's `accountCreateEmailToken` + update. For a link the user
 * clicks (rather than a code they type), use {@link useMagicLink}.
 *
 * @example
 * ```tsx
 * const { send, verify } = useEmailOtp()
 * await send.mutateAsync({ email })
 * verify.mutate({ email, token: '123456' })
 * ```
 */
export function useEmailOtp() {
  const { supabase } = useSupabase()

  const send = useMutation<void, SupabaseException, SendEmailOtpVariables>({
    mutationKey: Keys.auth().emailOtp().create(),
    mutationFn: async ({ email, shouldCreateUser, emailRedirectTo }) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser, emailRedirectTo },
      })
      if (error) throw error
    },
  })

  const verify = useMutation<Session, SupabaseException, VerifyEmailOtpVariables>({
    mutationKey: Keys.auth().emailOtp().update(),
    mutationFn: async ({ email, token, type = 'email' }) => {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type })
      if (error) throw error
      return data.session as Session
    },
  })

  return { send, verify }
}
