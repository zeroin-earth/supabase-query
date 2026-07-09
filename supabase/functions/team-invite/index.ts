// team-invite — email-based team invites (migration plan §8.8).
//
// Why an Edge Function and not a plain RPC: inviting is by EMAIL, and the
// invitee may not have an account yet. Provisioning a user and sending the
// invite email requires the SERVICE ROLE, which must never reach the client or
// live inside an RLS-guarded RPC. So this runs server-side with the service key.
//
// Flow:
//   1. Verify the caller's JWT (from the Authorization header).
//   2. Authorize: assert the caller is an active `owner` of the team
//      (`is_team_owner` RPC, service-role client).
//   3. Resolve the invitee's email → existing `auth.users` id, or provision +
//      email them via `auth.admin.inviteUserByEmail`.
//   4. Upsert a `pending` membership row (on conflict (team_id, email)) with a
//      fresh `invite_token`, and return it.
//
// Local test: `supabase functions serve team-invite`. The always-on
// `supabase start` runtime does NOT hot-serve functions, so the P9 suite mocks
// the invoke transport and live-tests the DB-side `accept_invite` RPC instead
// (same pattern as P8).
//
// Deploy: `supabase functions deploy team-invite` (uses the project's built-in
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY secrets).

import { createClient } from 'jsr:@supabase/supabase-js@2'

type InviteBody = {
  teamId?: string
  email?: string
  roles?: string[]
  redirectTo?: string
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500)

  // Service-role client: bypasses RLS for the owner check, user lookup, and the
  // membership upsert (team_members has no INSERT grant to `authenticated`).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Verify the caller.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'missing authorization' }, 401)

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) return json({ error: 'invalid token' }, 401)
  const caller = userData.user

  // Parse + validate the body.
  let body: InviteBody
  try {
    body = (await req.json()) as InviteBody
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { teamId, email, roles = [], redirectTo } = body
  if (!teamId || !email) return json({ error: 'teamId and email are required' }, 400)
  // The library reserves 'owner'; invites never grant it directly.
  const safeRoles = roles.filter((r) => r !== 'owner')

  // 2. Authorize: the caller must be an active owner of the team.
  const { data: isOwner, error: ownerErr } = await admin.rpc('is_team_owner', {
    p_team: teamId,
    p_user: caller.id,
  })
  if (ownerErr) return json({ error: ownerErr.message }, 400)
  if (!isOwner) return json({ error: 'only an owner may invite members' }, 403)

  // 3. Resolve the invitee: find an existing account, else provision + email.
  let invitedUserId: string | null = null
  const { data: list } = await admin.auth.admin.listUsers()
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (existing) {
    invitedUserId = existing.id
  } else {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })
    if (inviteErr) return json({ error: inviteErr.message }, 400)
    invitedUserId = invited.user?.id ?? null
  }

  // 4. Upsert the pending membership row with a fresh claim token.
  const inviteToken = crypto.randomUUID()
  const { data: member, error: upsertErr } = await admin
    .from('team_members')
    .upsert(
      {
        team_id: teamId,
        email,
        user_id: invitedUserId,
        roles: safeRoles,
        status: 'pending',
        invited_by: caller.id,
        invite_token: inviteToken,
      },
      { onConflict: 'team_id,email' },
    )
    .select()
    .single()
  if (upsertErr) return json({ error: upsertErr.message }, 400)

  return json(member)
})
