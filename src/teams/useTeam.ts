import { teamQueryOptions } from './queryOptions'
import type { ResolvedTeamsConfig, Team, TeamsQueryOptions, TeamVariables } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches a single team by id. Visible only to active members (RLS).
 *
 * @example
 * ```tsx
 * const { data } = useTeam({ teamId })
 * // data.name, data.prefs
 * ```
 *
 * @returns A `UseQueryResult` with the team ({@link Team}).
 */
export function useTeam(
  { teamId }: TeamVariables,
  opts: TeamsQueryOptions = {},
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  return useQuery<Team, SupabaseException>({
    ...teamQueryOptions(supabase, config, { teamId }),
    ...opts,
  })
}
