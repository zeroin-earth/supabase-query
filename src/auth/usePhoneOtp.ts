import type { Session } from '@supabase/supabase-js'

import type { SendPhoneOtpVariables, VerifyPhoneOtpVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Phone (SMS) one-time-passcode login in two steps. Requires an SMS provider
 * configured in the project's Auth settings.
 *
 * - `send` — texts a code (`signInWithOtp` with `phone`).
 * - `verify` — exchanges the code for a session (`verifyOtp`, `type: 'sms'`).
 *
 * Replaces Appwrite's `accountCreatePhoneToken` + update.
 *
 * @example
 * ```tsx
 * const { send, verify } = usePhoneOtp()
 * await send.mutateAsync({ phone: '+15551234567' })
 * verify.mutate({ phone: '+15551234567', token: '123456' })
 * ```
 */
export function usePhoneOtp() {
  const { supabase } = useSupabase()

  const send = useMutation<void, SupabaseException, SendPhoneOtpVariables>({
    mutationKey: Keys.auth().phoneOtp().create(),
    mutationFn: async ({ phone, shouldCreateUser }) => {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser } })
      if (error) throw error
    },
  })

  const verify = useMutation<Session, SupabaseException, VerifyPhoneOtpVariables>({
    mutationKey: Keys.auth().phoneOtp().update(),
    mutationFn: async ({ phone, token, type = 'sms' }) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type })
      if (error) throw error
      return data.session as Session
    },
  })

  return { send, verify }
}
