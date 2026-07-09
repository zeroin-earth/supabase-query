import * as React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser, makeAdminClient } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { SupabaseProvider } from '../src/SupabaseProvider'
import { useCreateMembership } from '../src/teams/useCreateMembership'
import { useCreateTeam } from '../src/teams/useCreateTeam'
import { useTeamMemberships } from '../src/teams/useTeamMemberships'
import { useTeams } from '../src/teams/useTeams'
import { useUpdateMembership } from '../src/teams/useUpdateMembership'

// P9 teams — multi-user, recursion-safe RLS + management RPC authority, tested
// against the live local `supabase start` stack. Three real authed users
// (owner / member / non-member) exercise the policies exactly as an app would.
// The `team-invite` Edge Function's invoke transport is mocked (the local
// runtime doesn't hot-serve functions, P8 pattern); the DB-side `accept_invite`
// RPC + row logic are tested live.

const admin = makeAdminClient()

let owner: AuthedUser
let member: AuthedUser
let outsider: AuthedUser
let memberEmail: string
let outsiderEmail: string

async function emailOf(user: AuthedUser): Promise<string> {
  const { data } = await user.supabase.auth.getUser()
  return data.user!.email!
}

beforeAll(async () => {
  ;[owner, member, outsider] = await Promise.all([
    createAuthedUser(),
    createAuthedUser(),
    createAuthedUser(),
  ])
  ;[memberEmail, outsiderEmail] = await Promise.all([emailOf(member), emailOf(outsider)])
})

afterAll(async () => {
  await Promise.all([owner?.cleanup(), member?.cleanup(), outsider?.cleanup()])
})

/** Provider wrapper over a given client (defaults to the owner). */
function setup(supabase: SupabaseClient = owner.supabase) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
  const client = { supabase } as SupabaseHooksClient
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider client={client} queryClient={queryClient}>
      {children}
    </SupabaseProvider>
  )
  return { queryClient, wrapper }
}

/** Create a team via the RPC (as a given user) and return it. */
async function createTeam(user: AuthedUser, name: string) {
  const { data, error } = await user.supabase.rpc('create_team', { p_name: name })
  if (error) throw error
  return data as { id: string; name: string; prefs: Record<string, unknown> }
}

/** Seed an ACTIVE membership directly (service role bypasses RLS). */
async function seedMember(teamId: string, user: AuthedUser, email: string, roles: string[]) {
  const { data, error } = await admin
    .from('team_members')
    .insert({ team_id: teamId, user_id: user.uid, email, roles, status: 'active' })
    .select()
    .single()
  if (error) throw error
  return data as { id: string }
}

/** The owner's own membership id for a team. */
async function ownerMembershipId(teamId: string): Promise<string> {
  const { data, error } = await admin
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', owner.uid)
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

describe('P9 teams — create + read (recursion-safe RLS)', () => {
  test('create_team makes the creator an active owner', async () => {
    const { wrapper } = setup(owner.supabase)
    const { result } = renderHook(() => useCreateTeam(), { wrapper })

    let team: { id: string } | undefined
    await act(async () => {
      team = await result.current.mutateAsync({ name: 'Engineering' })
    })
    expect(team?.id).toBeDefined()

    const { data } = await admin
      .from('team_members')
      .select('roles,status,user_id')
      .eq('team_id', team!.id)
      .single()
    expect(data).toMatchObject({ roles: ['owner'], status: 'active', user_id: owner.uid })
  })

  test('an active member reads the team + roster without policy recursion', async () => {
    const team = await createTeam(owner, 'Recursion Proof')
    await seedMember(team.id, member, memberEmail, ['editor'])

    // Direct SELECT — a recursive policy pair would raise
    // "infinite recursion detected in policy for relation ...".
    const teamRead = await member.supabase.from('teams').select('*').eq('id', team.id).single()
    expect(teamRead.error).toBeNull()
    expect((teamRead.data as { id: string }).id).toBe(team.id)

    // And via the hook (list is RLS-scoped to the caller's teams).
    const { wrapper } = setup(member.supabase)
    const { result } = renderHook(() => useTeams(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.teams.some((t) => t.id === team.id)).toBe(true)

    // The roster read also succeeds for the member.
    const roster = renderHook(() => useTeamMemberships({ teamId: team.id }), {
      wrapper: setup(member.supabase).wrapper,
    })
    await waitFor(() => expect(roster.result.current.isSuccess).toBe(true))
    expect(roster.result.current.data?.total).toBe(2)
  })

  test('a non-member sees nothing', async () => {
    const team = await createTeam(owner, 'Private')

    const direct = await outsider.supabase.from('teams').select('*').eq('id', team.id)
    expect(direct.error).toBeNull()
    expect(direct.data).toEqual([])

    const { wrapper } = setup(outsider.supabase)
    const { result } = renderHook(() => useTeams(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.teams.some((t) => t.id === team.id)).toBe(false)
  })
})

describe('P9 teams — invite → accept', () => {
  test('accept_invite claims a pending row for the invited email only', async () => {
    const team = await createTeam(owner, 'Invite Flow')
    const token = crypto.randomUUID()
    // Seed a pending invite for the outsider's email (as the Edge Function would).
    await admin.from('team_members').insert({
      team_id: team.id,
      email: outsiderEmail,
      roles: ['viewer'],
      status: 'pending',
      invited_by: owner.uid,
      invite_token: token,
    })

    // Wrong account cannot claim it (email mismatch).
    const wrong = await member.supabase.rpc('accept_invite', { p_token: token })
    expect(wrong.error).not.toBeNull()

    // The invited account claims it → becomes active with its user_id set.
    const ok = await outsider.supabase.rpc('accept_invite', { p_token: token })
    expect(ok.error).toBeNull()
    expect(ok.data).toMatchObject({ status: 'active', user_id: outsider.uid })
    expect((ok.data as { invite_token: string | null }).invite_token).toBeNull()
  })

  test('useCreateMembership invokes the team-invite function with the right body', async () => {
    const calls: { name: string; opts?: unknown }[] = []
    const fake = {
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
      functions: {
        invoke: (name: string, opts?: unknown) => {
          calls.push({ name, opts })
          return Promise.resolve({ data: { id: 'm1', status: 'pending' }, error: null })
        },
      },
    } as unknown as SupabaseClient
    const { wrapper } = setup(fake)

    const { result } = renderHook(() => useCreateMembership(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        teamId: 't1',
        email: 'alice@example.com',
        roles: ['editor'],
      })
    })

    expect(calls[0]?.name).toBe('team-invite')
    expect(calls[0]?.opts).toMatchObject({
      body: { teamId: 't1', email: 'alice@example.com', roles: ['editor'] },
    })
  })
})

describe('P9 teams — management RPC authority', () => {
  test('an owner can update a member’s roles; a non-owner cannot', async () => {
    const team = await createTeam(owner, 'Roles')
    const seeded = await seedMember(team.id, member, memberEmail, ['editor'])

    // Owner updates roles via the hook.
    const { wrapper } = setup(owner.supabase)
    const { result } = renderHook(() => useUpdateMembership(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        teamId: team.id,
        membershipId: seeded.id,
        roles: ['editor', 'viewer'],
      })
    })
    const after = await admin.from('team_members').select('roles').eq('id', seeded.id).single()
    expect((after.data as { roles: string[] }).roles).toEqual(['editor', 'viewer'])

    // A plain member cannot manage — the security-definer RPC asserts owner.
    const denied = await member.supabase.rpc('update_member_roles', {
      p_member: await ownerMembershipId(team.id),
      p_roles: ['owner'],
    })
    expect(denied.error).not.toBeNull()
  })

  test('an owner can transition a member’s status (incl. blocked)', async () => {
    const team = await createTeam(owner, 'Statuses')
    const seeded = await seedMember(team.id, member, memberEmail, ['editor'])

    for (const status of ['blocked', 'inactive', 'active'] as const) {
      const res = await owner.supabase.rpc('set_member_status', {
        p_member: seeded.id,
        p_status: status,
      })
      expect(res.error).toBeNull()
      expect((res.data as { status: string }).status).toBe(status)
    }

    // Invalid status is rejected.
    const bad = await owner.supabase.rpc('set_member_status', {
      p_member: seeded.id,
      p_status: 'nonsense',
    })
    expect(bad.error).not.toBeNull()
  })

  test('an owner can remove a member', async () => {
    const team = await createTeam(owner, 'Removal')
    const seeded = await seedMember(team.id, member, memberEmail, ['editor'])

    const res = await owner.supabase.rpc('remove_member', { p_member: seeded.id })
    expect(res.error).toBeNull()

    const gone = await admin.from('team_members').select('id').eq('id', seeded.id)
    expect(gone.data).toEqual([])
  })
})

describe('P9 teams — last-owner guard rails', () => {
  test('the last owner cannot leave, be removed, or be demoted', async () => {
    const team = await createTeam(owner, 'Sole Owner')
    const membershipId = await ownerMembershipId(team.id)

    const leave = await owner.supabase.rpc('leave_team', { p_team: team.id })
    expect(leave.error).not.toBeNull()

    const remove = await owner.supabase.rpc('remove_member', { p_member: membershipId })
    expect(remove.error).not.toBeNull()

    const demote = await owner.supabase.rpc('update_member_roles', {
      p_member: membershipId,
      p_roles: [],
    })
    expect(demote.error).not.toBeNull()

    const deactivate = await owner.supabase.rpc('set_member_status', {
      p_member: membershipId,
      p_status: 'inactive',
    })
    expect(deactivate.error).not.toBeNull()

    // Still an active owner after all the rejected attempts.
    const still = await admin
      .from('team_members')
      .select('roles,status')
      .eq('id', membershipId)
      .single()
    expect(still.data).toMatchObject({ roles: ['owner'], status: 'active' })
  })

  test('an owner CAN leave once a second owner exists', async () => {
    const team = await createTeam(owner, 'Two Owners')
    await seedMember(team.id, member, memberEmail, ['owner'])

    const res = await owner.supabase.rpc('leave_team', { p_team: team.id })
    expect(res.error).toBeNull()

    const remaining = await admin
      .from('team_members')
      .select('user_id')
      .eq('team_id', team.id)
      .eq('status', 'active')
    expect(remaining.data).toEqual([{ user_id: member.uid }])
  })
})
