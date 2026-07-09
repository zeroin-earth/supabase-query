import { membershipQueryOptions } from './queryOptions'
import type {
  ResolvedTeamsConfig,
  TeamMember,
  TeamMembershipVariables,
  TeamsQueryOptions,
} from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches a single team membership by id (scoped to a team for cache keying).
 *
 * @typeParam Role - The consumer's role vocabulary (defaults to `string`).
 *
 * @example
 * ```tsx
 * const { data } = useTeamMembership({ teamId, membershipId })
 * // data.roles, data.status, data.email
 * ```
 *
 * @returns A `UseQueryResult` with the membership ({@link TeamMember}).
 */
export function useTeamMembership<Role extends string = string>(
  { teamId, membershipId }: TeamMembershipVariables,
  opts: TeamsQueryOptions = {},
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  return useQuery<TeamMember<Role>, SupabaseException>({
    ...membershipQueryOptions<Role>(supabase, config, { teamId, membershipId }),
    ...opts,
  })
}
