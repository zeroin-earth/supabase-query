import type { CreateMembershipVariables, ResolvedTeamsConfig, TeamMember } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Mutation to invite a user to a team **by email**. Invokes the `team-invite`
 * Edge Function, which runs with the service role to (a) authorize the caller as
 * an owner, (b) look up or provision the invitee's account + send Supabase's
 * invite email, and (c) upsert a `pending` membership row with a claim token
 * (migration plan §8.8). Provisioning/emailing can't live in the client or a
 * plain RPC, hence the function.
 *
 * The invitee later accepts via `useUpdateMembershipStatus().accept({ token })`.
 *
 * **Online-only** (Edge Function invoke) — out of the offline queue.
 *
 * @typeParam Role - The consumer's role vocabulary (defaults to `string`).
 *
 * @example
 * ```tsx
 * const { mutate } = useCreateMembership()
 * mutate({ teamId, email: 'alice@example.com', roles: ['editor'] })
 * ```
 */
export function useCreateMembership<Role extends string = string>(
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<TeamMember<Role>, SupabaseException, CreateMembershipVariables<Role>>({
    mutationKey: Keys.teams().memberships().create(),
    networkMode: 'online',
    mutationFn: async ({ teamId, email, roles, redirectTo }) => {
      const { data, error } = await supabase.functions.invoke<TeamMember<Role>>(config.fn.invite, {
        body: { teamId, email, roles, redirectTo },
      })
      if (error) throw error
      return data as TeamMember<Role>
    },
    onSuccess: (_data, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).memberships().key() })
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).key() })
    },
  })
}
