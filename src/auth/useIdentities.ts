import type { UserIdentity } from '@supabase/supabase-js'

import type { LinkIdentityVariables } from './types'
import { Keys } from '../query/Keys'
import type { QueryOptions, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQuery } from '../useQuery'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Linked OAuth identities for the current user, wrapping `auth.getUserIdentities`
 * / `linkIdentity` / `unlinkIdentity` in one hook.
 *
 * Returns:
 * - `identities` — a query of the user's linked identities.
 * - `linkIdentity` — begin linking another provider (redirects like OAuth login;
 *   requires manual linking enabled, §8.9).
 * - `unlinkIdentity` — remove a linked identity (pass the {@link UserIdentity}
 *   object); invalidates `identities` on success.
 *
 * @example
 * ```tsx
 * const { identities, linkIdentity, unlinkIdentity } = useIdentities()
 * linkIdentity.mutate({ provider: 'github' })
 * ```
 */
export function useIdentities(identitiesOptions: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  const identities = useQuery({
    queryKey: Keys.auth().identities(),
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities()
      if (error) throw error
      return data.identities
    },
    retry: false,
    ...identitiesOptions,
  })

  const linkIdentity = useMutation<unknown, SupabaseException, LinkIdentityVariables>({
    mutationKey: Keys.auth().identity().create(),
    mutationFn: async ({ provider, redirectTo, scopes }) => {
      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo, scopes },
      })
      if (error) throw error
      return data
    },
  })

  const unlinkIdentity = useMutation<unknown, SupabaseException, UserIdentity>({
    mutationKey: Keys.auth().identity().delete(),
    mutationFn: async (identity) => {
      const { data, error } = await supabase.auth.unlinkIdentity(identity)
      if (error) throw error
      return data
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: Keys.auth().identities() }),
  })

  return { identities, linkIdentity, unlinkIdentity }
}
