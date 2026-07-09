import type { ResolvedTeamsConfig, TeamMember, UpdateMembershipVariables } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Mutation to replace a member's roles. Calls the `update_member_roles` RPC,
 * which is owner-gated in its body (security-definer RPCs bypass RLS, so they
 * assert authority themselves) and refuses to strip `'owner'` from the last
 * owner (migration plan §8.8 guard rails).
 *
 * **Online-only** (RPC) — out of the offline queue.
 *
 * @typeParam Role - The consumer's role vocabulary (defaults to `string`).
 *
 * @example
 * ```tsx
 * const { mutate } = useUpdateMembership()
 * mutate({ teamId, membershipId, roles: ['editor', 'viewer'] })
 * ```
 */
export function useUpdateMembership<Role extends string = string>(
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<TeamMember<Role>, SupabaseException, UpdateMembershipVariables<Role>>({
    mutationKey: Keys.teams().memberships().update(),
    networkMode: 'online',
    mutationFn: async ({ membershipId, roles }) => {
      const { data, error } = await supabase.rpc(config.rpc.updateMemberRoles, {
        p_member: membershipId,
        p_roles: roles,
      })
      if (error) throw error
      return data as TeamMember<Role>
    },
    onSuccess: (_data, { teamId, membershipId }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).memberships().key() })
      void queryClient.invalidateQueries({
        queryKey: Keys.team(teamId).membership(membershipId).key(),
      })
    },
  })
}
