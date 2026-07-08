import type { PasswordRecoveryVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Sends a password-recovery email (`resetPasswordForEmail`). Clicking the link
 * returns the user to `redirectTo` inside a short-lived recovery session, where
 * {@link useResetPassword} sets the new password.
 *
 * Unlike Appwrite, the recovery session — not a `userId`/`secret` pair — is what
 * authorizes the reset, so nothing needs to be stashed client-side between the
 * two steps.
 *
 * @example
 * ```tsx
 * const { mutate } = usePasswordRecovery()
 * mutate({ email, redirectTo: 'https://example.com/reset' })
 * ```
 */
export function usePasswordRecovery() {
  const { supabase } = useSupabase()

  return useMutation<void, SupabaseException, PasswordRecoveryVariables>({
    mutationKey: Keys.auth().recovery().create(),
    mutationFn: async ({ email, redirectTo }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) throw error
    },
  })
}
