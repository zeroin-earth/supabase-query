import type {
  ResolvedTeamsConfig,
  Team,
  TeamMember,
  TeamMembershipsResult,
  TeamsResult,
} from './types'
import { Keys } from '../query/Keys'
import type { AnySupabaseClient } from '../types'

/**
 * Query options for the current user's teams. RLS ("members read team") already
 * restricts the result to teams the caller is an active member of, so there is
 * no explicit `user_id` filter — just as with `db/` reads, the DB decides access.
 */
export function teamsQueryOptions(supabase: AnySupabaseClient, config: ResolvedTeamsConfig) {
  return {
    queryKey: Keys.teams().key(),
    queryFn: async (): Promise<TeamsResult> => {
      const { data, error, count } = await supabase
        .from(config.tables.teams)
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (error) throw error
      return { total: count ?? 0, teams: (data ?? []) as Team[] }
    },
  }
}

/** Query options for a single team by id. */
export function teamQueryOptions(
  supabase: AnySupabaseClient,
  config: ResolvedTeamsConfig,
  { teamId }: { teamId: string },
) {
  return {
    queryKey: Keys.team(teamId).key(),
    queryFn: async (): Promise<Team> => {
      const { data, error } = await supabase
        .from(config.tables.teams)
        .select('*')
        .eq('id', teamId)
        .single()
      if (error) throw error
      return data as Team
    },
  }
}

/** Query options for a team's preferences (the `prefs` column of `teams`). */
export function teamPrefsQueryOptions(
  supabase: AnySupabaseClient,
  config: ResolvedTeamsConfig,
  { teamId }: { teamId: string },
) {
  return {
    queryKey: Keys.team(teamId).teamPrefs().key(),
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from(config.tables.teams)
        .select('prefs')
        .eq('id', teamId)
        .single()
      if (error) throw error
      return ((data as { prefs?: Record<string, unknown> })?.prefs ?? {}) as Record<string, unknown>
    },
  }
}

/**
 * Query options for a team's membership roster. RLS ("members read roster")
 * restricts this to active members of the team (plus the caller's own row).
 */
export function membershipsQueryOptions<Role extends string = string>(
  supabase: AnySupabaseClient,
  config: ResolvedTeamsConfig,
  { teamId }: { teamId: string },
) {
  return {
    queryKey: Keys.team(teamId).memberships().key(),
    queryFn: async (): Promise<TeamMembershipsResult<Role>> => {
      const { data, error, count } = await supabase
        .from(config.tables.members)
        .select('*', { count: 'exact' })
        .eq('team_id', teamId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return { total: count ?? 0, memberships: (data ?? []) as TeamMember<Role>[] }
    },
  }
}

/** Query options for a single membership by id. */
export function membershipQueryOptions<Role extends string = string>(
  supabase: AnySupabaseClient,
  config: ResolvedTeamsConfig,
  { teamId, membershipId }: { teamId: string; membershipId: string },
) {
  return {
    queryKey: Keys.team(teamId).membership(membershipId).key(),
    queryFn: async (): Promise<TeamMember<Role>> => {
      const { data, error } = await supabase
        .from(config.tables.members)
        .select('*')
        .eq('id', membershipId)
        .single()
      if (error) throw error
      return data as TeamMember<Role>
    },
  }
}
