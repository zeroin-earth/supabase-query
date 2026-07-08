import type { Session } from '@supabase/supabase-js'

import type { LoginVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Logs in with email + password, returning the new {@link Session}.
 *
 * On success the provider's `onAuthStateChange` subscription pushes the user
 * into the cache, so {@link useUser} updates without an explicit invalidation.
 *
 * OAuth, magic-link, OTP and anonymous logins live in their own hooks
 * ({@link useOAuthLogin}, {@link useMagicLink}, {@link useEmailOtp},
 * {@link usePhoneOtp}, {@link useAnonymousLogin}).
 *
 * @example
 * ```tsx
 * const { mutate } = useLogin()
 * mutate({ email, password })
 * ```
 */
export function useLogin() {
  const { supabase } = useSupabase()

  return useMutation<Session, SupabaseException, LoginVariables>({
    mutationKey: Keys.auth().login().create(),
    mutationFn: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data.session
    },
  })
}
