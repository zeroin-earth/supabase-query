import type { DeleteTeamVariables, ResolvedTeamsConfig } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Deletes a team via a plain-table write (cascades to its memberships).
 * Standalone so the offline registry (P5) can replay it from persisted
 * variables.
 */
export async function deleteTeamFn(
  supabase: AnySupabaseClient,
  { teamId, table = CANONICAL_TEAMS_CONFIG.tables.teams }: DeleteTeamVariables,
): Promise<{ id: string }> {
  const { error } = await supabase.from(table).delete().eq('id', teamId)
  if (error) throw error
  return { id: teamId }
}

/**
 * Mutation to delete a team. Owner-gated by RLS ("owners delete team").
 * **Offline-queueable** (optimistic removal of the cached team).
 *
 * @example
 * ```tsx
 * const { mutate } = useDeleteTeam()
 * mutate({ teamId })
 * ```
 */
export function useDeleteTeam(config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  return useMutation<
    { id: string },
    SupabaseException,
    DeleteTeamVariables,
    { previous: [readonly unknown[], unknown][] }
  >({
    mutationKey: Keys.teams().delete(),
    mutationFn: ({ teamId }) =>
      deleteTeamFn(supabase, { teamId, table: config.tables.teams, schema: config.schema }),
    onMutate: async ({ teamId }) => {
      const teamKey = Keys.team(teamId).key()
      await queryClient.cancelQueries({ queryKey: teamKey })
      const previous = queryClient.getQueriesData({ queryKey: teamKey })
      queryClient.removeQueries({ queryKey: teamKey })
      return { previous }
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: (_data, _error, { teamId }) => {
      queryClient.removeQueries({ queryKey: Keys.team(teamId).key() })
      void queryClient.invalidateQueries({ queryKey: Keys.teams().key() })
    },
  })
}
