import type { Session, User } from '@supabase/supabase-js'

import type { SignUpVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/** The result of {@link useSignUp}: the created user and (if email confirmation
 * is disabled) an immediate session. `session` is `null` when the project
 * requires email confirmation before sign-in. */
export type SignUpResult = { user: User | null; session: Session | null }

/**
 * Creates a new account with email + password.
 *
 * Extra profile fields go in `data` and land on `user_metadata` (there is no
 * separate name/prefs concept — it's all metadata). If the project requires
 * email confirmation, `session` is `null` until the user confirms; otherwise a
 * session is issued immediately and the provider's `onAuthStateChange` mirrors
 * the user into the cache.
 *
 * Unlike Appwrite there is no client-supplied `userId` — GoTrue assigns the id.
 *
 * @example
 * ```tsx
 * const { mutate } = useSignUp()
 * mutate({ email, password, data: { name: 'Jane Doe' } })
 * ```
 */
export function useSignUp() {
  const { supabase } = useSupabase()

  return useMutation<SignUpResult, SupabaseException, SignUpVariables>({
    mutationKey: Keys.auth().signUp().create(),
    mutationFn: async ({ email, password, data, emailRedirectTo }) => {
      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data, emailRedirectTo },
      })
      if (error) throw error
      return { user: result.user, session: result.session }
    },
  })
}
