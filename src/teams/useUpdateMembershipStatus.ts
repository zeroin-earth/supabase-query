import type {
  AcceptInviteVariables,
  ResolvedTeamsConfig,
  SetMemberStatusVariables,
  TeamMember,
} from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Membership status transitions, in one hook (mirrors the auth module's
 * multi-mutation hooks like `useEmailOtp`). Returns:
 *
 * - `accept` — the **invitee** claims a `pending` invite with its token
 *   (`accept_invite` RPC): sets their `user_id`, activates the row. The RPC only
 *   lets the invited email's user claim it.
 * - `setStatus` — an **owner** changes a member's status
 *   (`set_member_status` RPC): `inactive`/`blocked`/reactivate. Owner-gated in
 *   the RPC body; refuses to deactivate the last owner.
 *
 * Both are **online-only** (RPC) — out of the offline queue.
 *
 * @typeParam Role - The consumer's role vocabulary (defaults to `string`).
 *
 * @example
 * ```tsx
 * const { accept, setStatus } = useUpdateMembershipStatus()
 * accept.mutate({ token })                                   // invitee
 * setStatus.mutate({ teamId, membershipId, status: 'blocked' }) // owner
 * ```
 */
export function useUpdateMembershipStatus<Role extends string = string>(
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  const accept = useMutation<TeamMember<Role>, SupabaseException, AcceptInviteVariables>({
    mutationKey: Keys.teams().membershipStatus().create(),
    networkMode: 'online',
    mutationFn: async ({ token }) => {
      const { data, error } = await supabase.rpc(config.rpc.acceptInvite, { p_token: token })
      if (error) throw error
      return data as TeamMember<Role>
    },
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: Keys.teams().key() })
      if (member?.team_id) {
        void queryClient.invalidateQueries({
          queryKey: Keys.team(member.team_id).memberships().key(),
        })
      }
    },
  })

  const setStatus = useMutation<TeamMember<Role>, SupabaseException, SetMemberStatusVariables>({
    mutationKey: Keys.teams().membershipStatus().update(),
    networkMode: 'online',
    mutationFn: async ({ membershipId, status }) => {
      const { data, error } = await supabase.rpc(config.rpc.setMemberStatus, {
        p_member: membershipId,
        p_status: status,
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

  return { accept, setStatus }
}
