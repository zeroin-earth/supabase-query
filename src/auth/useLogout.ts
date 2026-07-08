import type { LogoutVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/**
 * Signs the current user out. Pass `{ scope }` to control reach: `'global'`
 * (default) revokes every session, `'local'` only this device, `'others'` all
 * but the current one.
 *
 * On success the provider's `onAuthStateChange` fires `SIGNED_OUT`, which clears
 * the whole query cache (dropping per-user data) — so no manual invalidation is
 * needed here.
 *
 * @example
 * ```tsx
 * const { mutate } = useLogout()
 * mutate() // or mutate({ scope: 'local' })
 * ```
 */
export function useLogout() {
  const { supabase } = useSupabase()

  return useMutation<void, SupabaseException, LogoutVariables>({
    mutationKey: [...Keys.auth().key(), 'logout'],
    mutationFn: async (variables) => {
      const scope = variables?.scope
      const { error } = await supabase.auth.signOut(scope ? { scope } : undefined)
      if (error) throw error
    },
  })
}
