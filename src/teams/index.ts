// The `teams/` module: a LIBRARY-OWNED, fixed-shape module (migration plan §8.8).
// The library ships the teams schema-of-record (`sql/teams/0001_init.sql`, via
// `npx @zeroin.earth/supabase-query add-teams`) and owns the `Team`/`TeamMember`
// types — they are NOT parameterized by the consumer's generated `Database`.
// Fully wired (with the `Role`/config knobs) via `createSupabaseQuery`'s
// `makeTeamsHooks`.

export {
  membershipQueryOptions,
  membershipsQueryOptions,
  teamPrefsQueryOptions,
  teamQueryOptions,
  teamsQueryOptions,
} from './queryOptions'
export { useTeams } from './useTeams'
export { useTeam } from './useTeam'
export { useTeamPrefs } from './useTeamPrefs'
export { useTeamMemberships } from './useTeamMemberships'
export { useTeamMembership } from './useTeamMembership'
export { updateTeamNameFn, useUpdateTeamName } from './useUpdateTeamName'
export { updateTeamPrefsFn, useUpdateTeamPrefs } from './useUpdateTeamPrefs'
export { deleteTeamFn, useDeleteTeam } from './useDeleteTeam'
export { useCreateTeam } from './useCreateTeam'
export { useCreateMembership } from './useCreateMembership'
export { useUpdateMembership } from './useUpdateMembership'
export { useUpdateMembershipStatus } from './useUpdateMembershipStatus'
export { useDeleteMembership } from './useDeleteMembership'
export { makeTeamsHooks } from './factory'
export {
  CANONICAL_TEAMS_CONFIG,
  resolveTeamsConfig,
} from './types'
export type {
  AcceptInviteVariables,
  CreateMembershipVariables,
  CreateTeamVariables,
  DeleteTeamVariables,
  LeaveTeamVariables,
  RemoveMemberVariables,
  ResolvedTeamsConfig,
  SetMemberStatusVariables,
  Team,
  TeamMember,
  TeamMembershipsResult,
  TeamMembershipsVariables,
  TeamMembershipVariables,
  TeamMemberStatus,
  TeamsConfig,
  TeamsResult,
  TeamVariables,
  UpdateMembershipVariables,
  UpdateTeamNameVariables,
  UpdateTeamPrefsVariables,
} from './types'
