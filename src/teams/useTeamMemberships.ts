import { membershipsQueryOptions } from './queryOptions'
import type {
  ResolvedTeamsConfig,
  TeamMembershipsResult,
  TeamMembershipsVariables,
  TeamsQueryOptions,
} from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches a team's membership roster. RLS ("members read roster") restricts this
 * to active members of the team (plus the caller's own row).
 *
 * @typeParam Role - The consumer's role vocabulary (defaults to `string`).
 *
 * @example
 * ```tsx
 * const { data } = useTeamMemberships({ teamId })
 * // data.total, data.memberships
 * ```
 *
 * @returns A `UseQueryResult` with the roster ({@link TeamMembershipsResult}).
 */
export function useTeamMemberships<Role extends string = string>(
  { teamId }: TeamMembershipsVariables,
  opts: TeamsQueryOptions = {},
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  return useQuery<TeamMembershipsResult<Role>, SupabaseException>({
    ...membershipsQueryOptions<Role>(supabase, config, { teamId }),
    ...opts,
  })
}
