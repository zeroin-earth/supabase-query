import type { Session } from '@supabase/supabase-js'

import type { AnonymousLoginVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Creates an anonymous session (a real user row with no email/password).
 *
 * Must be enabled in the project's Auth settings (`enable_anonymous_sign_ins`,
 * §8.9). Later, `useUpdateUser`/`useSignUp` can promote the anonymous user to a
 * permanent account. Returns the new {@link Session}.
 *
 * @example
 * ```tsx
 * const { mutate } = useAnonymousLogin()
 * mutate() // or mutate({ data: { theme: 'dark' } })
 * ```
 */
export function useAnonymousLogin() {
  const { supabase } = useSupabase()

  return useMutation<Session, SupabaseException, AnonymousLoginVariables>({
    mutationKey: Keys.auth().anonymous().create(),
    mutationFn: async (variables) => {
      const { data, error } = await supabase.auth.signInAnonymously(
        variables?.data ? { options: { data: variables.data } } : undefined,
      )
      if (error) throw error
      return data.session as Session
    },
  })
}
