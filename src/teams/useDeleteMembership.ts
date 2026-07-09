import type { LeaveTeamVariables, RemoveMemberVariables, ResolvedTeamsConfig } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Membership removal, in one hook. Returns:
 *
 * - `remove` — an **owner** removes another member (`remove_member` RPC).
 *   Owner-gated; refuses to remove the last owner.
 * - `leave` — a member **leaves** a team themselves (`leave_team` RPC). The last
 *   owner cannot leave without transferring ownership first (would orphan the
 *   team).
 *
 * Both are **online-only** (RPC) — out of the offline queue.
 *
 * @example
 * ```tsx
 * const { remove, leave } = useDeleteMembership()
 * remove.mutate({ teamId, membershipId })  // owner removes someone
 * leave.mutate({ teamId })                 // I leave
 * ```
 */
export function useDeleteMembership(config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  const remove = useMutation<void, SupabaseException, RemoveMemberVariables>({
    mutationKey: Keys.teams().memberships().delete(),
    networkMode: 'online',
    mutationFn: async ({ membershipId }) => {
      const { error } = await supabase.rpc(config.rpc.removeMember, { p_member: membershipId })
      if (error) throw error
    },
    onSuccess: (_data, { teamId, membershipId }) => {
      queryClient.removeQueries({ queryKey: Keys.team(teamId).membership(membershipId).key() })
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).memberships().key() })
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).key() })
    },
  })

  const leave = useMutation<void, SupabaseException, LeaveTeamVariables>({
    mutationKey: [...Keys.teams().memberships().delete(), 'leave'],
    networkMode: 'online',
    mutationFn: async ({ teamId }) => {
      const { error } = await supabase.rpc(config.rpc.leaveTeam, { p_team: teamId })
      if (error) throw error
    },
    onSuccess: (_data, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).memberships().key() })
      void queryClient.invalidateQueries({ queryKey: Keys.teams().key() })
    },
  })

  return { remove, leave }
}
