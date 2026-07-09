import type { QueryOptions } from '../types'

// -----------------------------------------------------------------------------
// Teams is a LIBRARY-OWNED, fixed-shape module (same category as auth/ and
// storage/, NOT the schema-generic db/). The library ships the teams schema-of-
// record (`sql/teams/0001_init.sql`) and therefore owns these types — they are
// hand-defined to match the shipped migration and work even before a consumer
// runs `supabase gen types` (migration plan §8.8). They are deliberately NOT
// derived from the consumer's generated `Database`.
// -----------------------------------------------------------------------------

/**
 * Membership lifecycle status. Library-owned and fixed (a `check` constraint in
 * the migration), unlike roles which are consumer-defined.
 *
 * - `pending` — an email invite that has not yet been accepted.
 * - `active` — an accepted, current member.
 * - `inactive` — soft-disabled (e.g. paused access), reactivatable.
 * - `blocked` — denied access.
 */
export type TeamMemberStatus = 'pending' | 'active' | 'inactive' | 'blocked'

/** A team row (`public.teams`). */
export type Team = {
  id: string
  name: string
  /** Arbitrary key/value team preferences (`jsonb`). */
  prefs: Record<string, unknown>
  created_at: string
}

/**
 * A team membership row (`public.team_members`).
 *
 * @typeParam Role - The consumer's role vocabulary. Defaults to `string`; pass a
 *   union (e.g. `'owner' | 'editor' | 'viewer'`) via `makeTeamsHooks<Role>()` for
 *   autocomplete. `'owner'` is the one value the library reserves as the v1
 *   authority anchor.
 */
export type TeamMember<Role extends string = string> = {
  id: string
  team_id: string
  /** `null` while a pending email-invite is unclaimed; set on accept. */
  user_id: string | null
  /** The address an invite was sent to (kept for pending invites + audit). */
  email: string | null
  roles: Role[]
  status: TeamMemberStatus
  invited_by: string | null
  /** Claim token for the accept flow; `null` once accepted. */
  invite_token: string | null
  created_at: string
}

/** The result of a team list read: the rows plus the `exact` total. */
export type TeamsResult = {
  total: number
  teams: Team[]
}

/** The result of a membership roster read: the rows plus the `exact` total. */
export type TeamMembershipsResult<Role extends string = string> = {
  total: number
  memberships: TeamMember<Role>[]
}

// --- Hook variable shapes ----------------------------------------------------

/** Variables for `useTeam` / `useTeamPrefs`. */
export type TeamVariables = { teamId: string }

/** Variables for `useTeamMemberships`. */
export type TeamMembershipsVariables = { teamId: string }

/** Variables for `useTeamMembership`. */
export type TeamMembershipVariables = { teamId: string; membershipId: string }

/** Variables for `useCreateTeam` (RPC `create_team`). */
export type CreateTeamVariables = {
  name: string
  /** Optional initial preferences. */
  prefs?: Record<string, unknown>
}

/**
 * Variables for `useUpdateTeamName`. Offline-queueable: `table`/`schema` are
 * injected by the factory (or default to canonical) so a paused mutation can be
 * replayed from its persisted variables alone.
 */
export type UpdateTeamNameVariables = {
  teamId: string
  name: string
  table?: string
  schema?: string
}

/** Variables for `useUpdateTeamPrefs`. Offline-queueable (see above). */
export type UpdateTeamPrefsVariables = {
  teamId: string
  prefs: Record<string, unknown>
  table?: string
  schema?: string
}

/** Variables for `useDeleteTeam`. Offline-queueable (see above). */
export type DeleteTeamVariables = {
  teamId: string
  table?: string
  schema?: string
}

/** Variables for `useCreateMembership` (invokes the `team-invite` Edge Function). */
export type CreateMembershipVariables<Role extends string = string> = {
  teamId: string
  /** The invitee's email address (invites are by email only, §8.8). */
  email: string
  /** Roles to assign on accept. `'owner'` is reserved. */
  roles?: Role[]
  /** Optional redirect URL baked into the invite email. */
  redirectTo?: string
}

/** Variables for accepting an invite (RPC `accept_invite`). */
export type AcceptInviteVariables = { teamId?: string; token: string }

/** Variables for setting a member's status (RPC `set_member_status`). */
export type SetMemberStatusVariables = {
  teamId: string
  membershipId: string
  status: TeamMemberStatus
}

/** Variables for `useUpdateMembership` (RPC `update_member_roles`). */
export type UpdateMembershipVariables<Role extends string = string> = {
  teamId: string
  membershipId: string
  roles: Role[]
}

/** Variables for removing a member (RPC `remove_member`). */
export type RemoveMemberVariables = { teamId: string; membershipId: string }

/** Variables for leaving a team (RPC `leave_team`). */
export type LeaveTeamVariables = { teamId: string }

// --- Configuration (name-override escape hatch) ------------------------------

/**
 * Optional overrides for `makeTeamsHooks`. Defaults are canonical
 * (`public`, `teams`, `team_members`, `create_team`, …) and cover ~all
 * projects; the override just prevents a hard wall for a project that already
 * has, say, an `organizations` table (migration plan §8.8). Don't over-invest.
 */
export type TeamsConfig = {
  schema?: string
  tables?: { teams?: string; members?: string }
  rpc?: {
    createTeam?: string
    acceptInvite?: string
    updateMemberRoles?: string
    setMemberStatus?: string
    removeMember?: string
    leaveTeam?: string
  }
  fn?: { invite?: string }
}

/** A fully-resolved {@link TeamsConfig} — every name filled in. */
export type ResolvedTeamsConfig = {
  schema: string
  tables: { teams: string; members: string }
  rpc: {
    createTeam: string
    acceptInvite: string
    updateMemberRoles: string
    setMemberStatus: string
    removeMember: string
    leaveTeam: string
  }
  fn: { invite: string }
}

/** The canonical names (what the shipped `sql/teams` migration creates). */
export const CANONICAL_TEAMS_CONFIG: ResolvedTeamsConfig = {
  schema: 'public',
  tables: { teams: 'teams', members: 'team_members' },
  rpc: {
    createTeam: 'create_team',
    acceptInvite: 'accept_invite',
    updateMemberRoles: 'update_member_roles',
    setMemberStatus: 'set_member_status',
    removeMember: 'remove_member',
    leaveTeam: 'leave_team',
  },
  fn: { invite: 'team-invite' },
}

/** Merges a partial {@link TeamsConfig} onto the canonical defaults. */
export function resolveTeamsConfig(config: TeamsConfig = {}): ResolvedTeamsConfig {
  return {
    schema: config.schema ?? CANONICAL_TEAMS_CONFIG.schema,
    tables: { ...CANONICAL_TEAMS_CONFIG.tables, ...config.tables },
    rpc: { ...CANONICAL_TEAMS_CONFIG.rpc, ...config.rpc },
    fn: { ...CANONICAL_TEAMS_CONFIG.fn, ...config.fn },
  }
}

/** Shared read options for the team query hooks. */
export type TeamsQueryOptions = QueryOptions
