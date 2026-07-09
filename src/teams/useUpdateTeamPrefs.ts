import type { ResolvedTeamsConfig, Team, UpdateTeamPrefsVariables } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Updates a team's preferences via a plain-table write. Standalone so the
 * offline registry (P5) can replay it from persisted variables. The whole
 * `prefs` object is replaced (last-write-wins), matching the Appwrite surface.
 */
export async function updateTeamPrefsFn(
  supabase: AnySupabaseClient,
  { teamId, prefs, table = CANONICAL_TEAMS_CONFIG.tables.teams }: UpdateTeamPrefsVariables,
): Promise<Team> {
  const { data, error } = await supabase
    .from(table)
    .update({ prefs })
    .eq('id', teamId)
    .select()
    .single()
  if (error) throw error
  return data as Team
}

/**
 * Mutation to replace a team's preferences. Owner-gated by RLS.
 * **Offline-queueable** (optimistic patch of the cached team + prefs).
 *
 * @example
 * ```tsx
 * const { mutate } = useUpdateTeamPrefs()
 * mutate({ teamId, prefs: { theme: 'dark' } })
 * ```
 */
export function useUpdateTeamPrefs(config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<
    Team,
    SupabaseException,
    UpdateTeamPrefsVariables,
    { previous: [readonly unknown[], unknown][] }
  >({
    mutationKey: Keys.teams().teamPrefs().update(),
    mutationFn: ({ teamId, prefs }) =>
      updateTeamPrefsFn(supabase, {
        teamId,
        prefs,
        table: config.tables.teams,
        schema: config.schema,
      }),
    onMutate: async ({ teamId, prefs }) => {
      const teamKey = Keys.team(teamId).key()
      const prefsKey = Keys.team(teamId).teamPrefs().key()
      await queryClient.cancelQueries({ queryKey: teamKey })
      const previous = [
        ...queryClient.getQueriesData({ queryKey: teamKey }),
        ...queryClient.getQueriesData({ queryKey: prefsKey }),
      ]
      queryClient.setQueryData<Team>(teamKey, (old) => (old ? { ...old, prefs } : old))
      queryClient.setQueryData<Record<string, unknown>>(prefsKey, prefs)
      return { previous }
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: (_data, _error, { teamId }) => {
      void queryClient.invalidateQueries({ queryKey: Keys.team(teamId).key() })
    },
  })
}
