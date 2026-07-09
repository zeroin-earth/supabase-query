import { teamsQueryOptions } from './queryOptions'
import type { ResolvedTeamsConfig, TeamsQueryOptions, TeamsResult } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches the teams the current user is an active member of.
 *
 * Access is governed by RLS ("members read team"), so — unlike the Appwrite
 * version — there is no `queries`/`search` argument threading permission logic
 * through the client; the DB returns exactly the teams the caller may see.
 *
 * @example
 * ```tsx
 * const { data } = useTeams()
 * // data.total, data.teams
 * ```
 *
 * @returns A `UseQueryResult` with the team list ({@link TeamsResult}).
 */
export function useTeams(
  opts: TeamsQueryOptions = {},
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  return useQuery<TeamsResult, SupabaseException>({
    ...teamsQueryOptions(supabase, config),
    ...opts,
  })
}
