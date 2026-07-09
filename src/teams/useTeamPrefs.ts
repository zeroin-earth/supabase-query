import { teamPrefsQueryOptions } from './queryOptions'
import type { ResolvedTeamsConfig, TeamsQueryOptions, TeamVariables } from './types'
import { CANONICAL_TEAMS_CONFIG } from './types'
import type { SupabaseException } from '../types'
import { useQuery } from '../useQuery'
import { useSupabase } from '../useSupabase'

/**
 * Fetches a team's preferences (the `prefs` jsonb column).
 *
 * @example
 * ```tsx
 * const { data } = useTeamPrefs({ teamId })
 * // data.theme, data.notificationsEnabled, …
 * ```
 *
 * @returns A `UseQueryResult` whose `data` is the preferences object.
 */
export function useTeamPrefs(
  { teamId }: TeamVariables,
  opts: TeamsQueryOptions = {},
  config: ResolvedTeamsConfig = CANONICAL_TEAMS_CONFIG,
) {
  const { supabase } = useSupabase()
  return useQuery<Record<string, unknown>, SupabaseException>({
    ...teamPrefsQueryOptions(supabase, config, { teamId }),
    ...opts,
  })
}
