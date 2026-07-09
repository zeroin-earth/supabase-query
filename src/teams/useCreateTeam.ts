import type { CreateTeamVariables, ResolvedTeamsConfig, Team } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Mutation to create a team. Calls the `create_team` RPC, which atomically
 * inserts the team **and** the creator's `owner` membership in one transaction
 * (the staged-transaction replacement, §6.4). The creator becomes an active
 * `'owner'` — the v1 authority anchor.
 *
 * **Online-only:** RPCs don't fit the offline conflict engine's fetch-row →
 * update-row model, so — like auth — this stays out of the offline replay queue
 * (`networkMode: 'online'`, migration plan §8.8 "Offline wiring").
 *
 * @example
 * ```tsx
 * const { mutate } = useCreateTeam()
 * mutate({ name: 'Engineering', prefs: { color: 'blue' } })
 * ```
 */
export function useCreateTeam(config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<Team, SupabaseException, CreateTeamVariables>({
    mutationKey: Keys.teams().create(),
    networkMode: 'online',
    mutationFn: async ({ name, prefs }) => {
      const { data, error } = await supabase.rpc(config.rpc.createTeam, {
        p_name: name,
        ...(prefs ? { p_prefs: prefs } : {}),
      })
      if (error) throw error
      return data as Team
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: Keys.teams().key() })
    },
  })
}
