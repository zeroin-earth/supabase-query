import type { ResolvedTeamsConfig, Team, UpdateTeamNameVariables } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Renames a team via a plain-table write. Standalone so the offline registry
 * (P5) can replay it from persisted variables — team name/prefs/delete are the
 * offline-queueable team writes; membership ops and `create_team` are RPC/Edge
 * calls and stay online-only (migration plan §8.8, "Offline wiring").
 */
export async function updateTeamNameFn(
  supabase: AnySupabaseClient,
  { teamId, name, table = CANONICAL_TEAMS_CONFIG.tables.teams }: UpdateTeamNameVariables,
): Promise<Team> {
  const { data, error } = await supabase
    .from(table)
    .update({ name })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data as Team
}

/**
 * Mutation to rename a team. Owner-gated by RLS ("owners update team"). This is
 * an **offline-queueable** plain-table write: it optimistically patches the
 * cached team and, if offline, replays on reconnect.
 *
 * @example
 * ```tsx
 * const { mutate } = useUpdateTeamName()
 * mutate({ teamId, name: 'Platform Engineering' })
 * ```
 */
export function useUpdateTeamName(config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<
    Team,
    SupabaseException,
    UpdateTeamNameVariables,
    { previous: [readonly unknown[], unknown][] }
  >({
    mutationKey: Keys.teams().teamName().update(),
    mutationFn: ({ teamId, name }) =>
      updateTeamNameFn(supabase, {
        teamId,
        name,
        table: config.tables.teams,
        schema: config.schema,
      }),
    onMutate: async ({ teamId, name }) => {
      const teamKey = Keys.team(teamId).key()
      await queryClient.cancelQueries({ queryKey: teamKey })
      const previous = queryClient.getQueriesData({ queryKey: teamKey })
      queryClient.setQueryData<Team>(teamKey, (old) => (old ? { ...old, name } : old))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: (_data, _error, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).key() })
      void queryClient.invalidateQueries({ queryKey: Keys.teams().key() })
    },
  })
}
