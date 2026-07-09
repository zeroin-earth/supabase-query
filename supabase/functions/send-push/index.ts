// send-push — fan a push notification out to a set of users (migration plan
// §6.6 / §8.12). Replaces Appwrite Messaging's server-side send.
//
// Why an Edge Function and not a client call: FCM v1 needs a service-account
// private key that must never ship in a client bundle. This runs server-side
// with the service role (to read every recipient's tokens, bypassing RLS) and
// the provider secrets.
//
// Flow:
//   1. Verify the caller's JWT (or accept a service-role secret for S2S).
//   2. Look up `device_tokens` for the target userIds (service role).
//   3. Branch by provider — Expo Push API (native) / FCM HTTP v1 (web).
//   4. Prune tokens the providers report as DeviceNotRegistered / UNREGISTERED.
//
// The branching + pruning logic lives in `sender.ts` (pure, unit-tested from
// bun). This file wires the real `fetch`, the FCM service-account JWT, and the
// service-role client around it.
//
// Local test: `supabase functions serve send-push` (the always-on
// `supabase start` runtime does NOT hot-serve functions). Deploy:
// `supabase functions deploy send-push`; secrets: `FCM_SERVICE_ACCOUNT`
// (JSON) + optional `EXPO_ACCESS_TOKEN`.

import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  type DeviceRow,
  dispatchPush,
  makeExpoSender,
  makeFcmSender,
  type ProviderSender,
  type PushMessage,
} from './sender.ts'

type SendBody = {
  userIds?: string[]
  title?: string
  body?: string
  data?: Record<string, unknown>
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

// --- FCM service-account → OAuth2 access token -------------------------------

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

/** Mints a short-lived Google OAuth2 access token for FCM v1 from a service account. */
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claim = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  )
  const signingInput = `${header}.${claim}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)),
  )
  const jwt = `${signingInput}.${base64url(sig)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status}`)
  const token = (await res.json()) as { access_token?: string }
  if (!token.access_token) throw new Error('FCM token exchange returned no access_token')
  return token.access_token
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'server misconfigured' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. Authorize the caller. A bare service-role key (S2S) is allowed; otherwise
  //    require a valid user JWT. (Extend here to gate who may push to whom.)
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'missing authorization' }, 401)
  if (token !== serviceKey) {
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return json({ error: 'invalid token' }, 401)
  }

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const { userIds, title, body: text, data } = body
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return json({ error: 'userIds is required' }, 400)
  }

  // 2. Look up the recipients' device tokens (service role bypasses RLS).
  const { data: rows, error: rowsErr } = await admin
    .from('device_tokens')
    .select('token, platform, provider')
    .in('user_id', userIds)
  if (rowsErr) return json({ error: rowsErr.message }, 400)
  const tokens = (rows ?? []) as DeviceRow[]
  if (tokens.length === 0) return json({ sent: 0, pruned: [] })

  // 3. Build the provider senders. Expo works keyless; FCM needs a JWT minted
  //    from the service account — only build it if there are fcm tokens.
  const message: PushMessage = { title, body: text, data }
  const expoSender = makeExpoSender(fetch, Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined)

  let fcmSender: ProviderSender = async () => ({ deadTokens: [] })
  if (tokens.some((t) => t.provider === 'fcm')) {
    const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT')
    if (!saRaw) return json({ error: 'FCM_SERVICE_ACCOUNT not configured' }, 500)
    try {
      const sa = JSON.parse(saRaw) as ServiceAccount
      const accessToken = await fcmAccessToken(sa)
      fcmSender = makeFcmSender(fetch, sa.project_id, accessToken)
    } catch (e) {
      return json({ error: `FCM setup failed: ${(e as Error).message}` }, 500)
    }
  }

  const { sent, deadTokens } = await dispatchPush(tokens, message, {
    expo: expoSender,
    fcm: fcmSender,
  })

  // 4. Prune dead tokens reported by the providers' receipts.
  if (deadTokens.length) {
    await admin.from('device_tokens').delete().in('token', deadTokens)
  }

  return json({ sent, pruned: deadTokens })
})
