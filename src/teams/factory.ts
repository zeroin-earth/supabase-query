import type {
  AcceptInviteVariables,
  CreateMembershipVariables,
  CreateTeamVariables,
  DeleteTeamVariables,
  LeaveTeamVariables,
  RemoveMemberVariables,
  SetMemberStatusVariables,
  TeamMembershipsVariables,
  TeamMembershipVariables,
  TeamsConfig,
  TeamsQueryOptions,
  TeamVariables,
  UpdateMembershipVariables,
  UpdateTeamNameVariables,
  UpdateTeamPrefsVariables,
} from './types'
import { resolveTeamsConfig } from './types'
import { useCreateMembership as useCreateMembershipBase } from './useCreateMembership'
import { useCreateTeam as useCreateTeamBase } from './useCreateTeam'
import { useDeleteMembership as useDeleteMembershipBase } from './useDeleteMembership'
import { useDeleteTeam as useDeleteTeamBase } from './useDeleteTeam'
import { useTeam as useTeamBase } from './useTeam'
import { useTeamMembership as useTeamMembershipBase } from './useTeamMembership'
import { useTeamMemberships as useTeamMembershipsBase } from './useTeamMemberships'
import { useTeamPrefs as useTeamPrefsBase } from './useTeamPrefs'
import { useTeams as useTeamsBase } from './useTeams'
import { useUpdateMembership as useUpdateMembershipBase } from './useUpdateMembership'
import { useUpdateMembershipStatus as useUpdateMembershipStatusBase } from './useUpdateMembershipStatus'
import { useUpdateTeamName as useUpdateTeamNameBase } from './useUpdateTeamName'
import { useUpdateTeamPrefs as useUpdateTeamPrefsBase } from './useUpdateTeamPrefs'

/**
 * Builds the teams hook set returned by `createSupabaseQuery`.
 *
 * Teams is a **library-owned fixed-shape module** (like `makeAuthHooks`/
 * `makeStorageHooks`, NOT the schema-generic `makeDbHooks`): its `Team`/
 * `TeamMember` types are hand-defined to match the shipped `sql/teams` migration,
 * so the hooks work even before the consumer runs `supabase gen types`.
 *
 * Two knobs, both optional:
 * - `Role` type param — the consumer's role vocabulary for autocomplete
 *   (`makeTeamsHooks<'owner' | 'editor' | 'viewer'>()`); defaults to `string`.
 *   `'owner'` is reserved by the library as the v1 authority anchor.
 * - `config` — the name-override escape hatch (schema/table/RPC/function names);
 *   defaults to canonical (`teams`, `team_members`, `create_team`, …). Don't
 *   over-invest — canonical covers ~all projects (migration plan §8.8).
 *
 * @internal
 */
export function makeTeamsHooks<Role extends string = string>(config: TeamsConfig = {}) {
  const c = resolveTeamsConfig(config)

  return {
    useTeams: (opts?: TeamsQueryOptions) => useTeamsBase(opts, c),
    useTeam: (vars: TeamVariables, opts?: TeamsQueryOptions) => useTeamBase(vars, opts, c),
    useTeamPrefs: (vars: TeamVariables, opts?: TeamsQueryOptions) =>
      useTeamPrefsBase(vars, opts, c),
    useTeamMemberships: (vars: TeamMembershipsVariables, opts?: TeamsQueryOptions) =>
      useTeamMembershipsBase<Role>(vars, opts, c),
    useTeamMembership: (vars: TeamMembershipVariables, opts?: TeamsQueryOptions) =>
      useTeamMembershipBase<Role>(vars, opts, c),

    // Offline-queueable plain-table writes.
    useUpdateTeamName: () => useUpdateTeamNameBase(c),
    useUpdateTeamPrefs: () => useUpdateTeamPrefsBase(c),
    useDeleteTeam: () => useDeleteTeamBase(c),

    // Online-only RPC / Edge-Function calls.
    useCreateTeam: () => useCreateTeamBase(c),
    useCreateMembership: () => useCreateMembershipBase<Role>(c),
    useUpdateMembership: () => useUpdateMembershipBase<Role>(c),
    useUpdateMembershipStatus: () => useUpdateMembershipStatusBase<Role>(c),
    useDeleteMembership: () => useDeleteMembershipBase(c),
  }
}

// Re-export the variable types so a consumer can annotate call-sites even when
// they only import the factory's returned hooks. (Type-only; erased at build.)
export type {
  AcceptInviteVariables,
  CreateMembershipVariables,
  CreateTeamVariables,
  DeleteTeamVariables,
  LeaveTeamVariables,
  RemoveMemberVariables,
  SetMemberStatusVariables,
  TeamMembershipsVariables,
  TeamMembershipVariables,
  TeamVariables,
  UpdateMembershipVariables,
  UpdateTeamNameVariables,
  UpdateTeamPrefsVariables,
}
