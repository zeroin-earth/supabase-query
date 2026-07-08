import type { User } from '@supabase/supabase-js'

import type { ResetPasswordVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Sets a new password, completing the flow started by
 * {@link usePasswordRecovery}. Must run inside the recovery session established
 * when the user opened the emailed link (`updateUser({ password })`).
 *
 * @example
 * ```tsx
 * const { mutate } = useResetPassword()
 * mutate({ password: 'new-secure-password' })
 * ```
 */
export function useResetPassword() {
  const { supabase } = useSupabase()

  return useMutation<User, SupabaseException, ResetPasswordVariables>({
    mutationKey: Keys.auth().recovery().update(),
    mutationFn: async ({ password }) => {
      const { data, error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      return data.user
    },
  })
}
