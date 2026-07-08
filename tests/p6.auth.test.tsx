import * as React from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser, LOCAL_ANON_KEY, LOCAL_URL, makeAdminClient } from './setup/localStack'
import { useAnonymousLogin } from '../src/auth/useAnonymousLogin'
import { useEmailOtp } from '../src/auth/useEmailOtp'
import { useIdentities } from '../src/auth/useIdentities'
import { useLogin } from '../src/auth/useLogin'
import { useLogout } from '../src/auth/useLogout'
import { useMagicLink } from '../src/auth/useMagicLink'
import { useMfa } from '../src/auth/useMfa'
import { useOAuthLogin } from '../src/auth/useOAuth'
import { usePasswordRecovery } from '../src/auth/usePasswordRecovery'
import { useSession } from '../src/auth/useSession'
import { useSignUp } from '../src/auth/useSignUp'
import { useUpdateUser } from '../src/auth/useUpdateUser'
import { useUser } from '../src/auth/useUser'
import type { SupabaseHooksClient } from '../src/client'
import { SupabaseProvider } from '../src/SupabaseProvider'

const admin = makeAdminClient()
const createdUids: string[] = []

/** Isolated per-client storage so each test's GoTrue session stays independent
 * (happy-dom's shared `localStorage` would otherwise cross-contaminate clients). */
function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

/** A fresh, initially-unauthenticated anon client. `persistSession` is on (with
 * isolated storage) so `onAuthStateChange` fires and the provider's user cache
 * stays in sync across login/logout. */
function makeClient(): SupabaseClient {
  const nativeWebSocket = (globalThis as unknown as { __NATIVE_WEBSOCKET__?: typeof WebSocket })
    .__NATIVE_WEBSOCKET__
  return createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryStorage(),
      // A unique storageKey per client keeps GoTrue's `navigator.locks`-based
      // session serialization from cross-contaminating (and hanging) independent
      // test clients that would otherwise share the URL-derived default key.
      storageKey: `sb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    realtime: nativeWebSocket ? { transport: nativeWebSocket as never } : {},
  })
}

/** Provider + fresh QueryClient bound to `supabase`. */
function setup(supabase: SupabaseClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const client = { supabase } as SupabaseHooksClient
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider client={client} queryClient={queryClient}>
      {children}
    </SupabaseProvider>
  )
  return { queryClient, wrapper }
}

/** Creates a confirmed user via the admin API (does not sign anyone in). */
async function createUser() {
  const email = `p6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'password123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  createdUids.push(data.user!.id)
  return { email, password, uid: data.user!.id }
}

afterAll(async () => {
  for (const uid of createdUids) {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
  }
})

describe('P6 auth — signup / login / logout', () => {
  test('useSignUp creates a user and useUser turns reactive', async () => {
    const supabase = makeClient()
    const { wrapper } = setup(supabase)
    const email = `p6-signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

    const { result } = renderHook(
      () => ({ signUp: useSignUp(), user: useUser() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.user.isSuccess).toBe(true))
    expect(result.current.user.user).toBeNull()

    await act(async () => {
      const res = await result.current.signUp.mutateAsync({
        email,
        password: 'password123',
        data: { name: 'Jane' },
      })
      if (res.user) createdUids.push(res.user.id)
    })

    // onAuthStateChange (SIGNED_IN) mirrors the new user into the cache.
    await waitFor(() => expect(result.current.user.user?.email).toBe(email))
    expect(result.current.user.user?.user_metadata.name).toBe('Jane')
  })

  test('useLogin populates the user, useLogout clears it', async () => {
    const { email, password } = await createUser()
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    const { result } = renderHook(
      () => ({ login: useLogin(), logout: useLogout(), user: useUser(), session: useSession() }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.user.isSuccess).toBe(true))
    expect(result.current.user.user).toBeNull()

    await act(async () => {
      await result.current.login.mutateAsync({ email, password })
    })
    await waitFor(() => expect(result.current.user.user?.email).toBe(email))

    // Session carries the JWT (replaces Appwrite's accountCreateJWT).
    await waitFor(() => expect(result.current.session.session?.access_token).toBeTruthy())

    await act(async () => {
      await result.current.logout.mutateAsync()
    })
    await waitFor(() => expect(result.current.user.user).toBeNull())
  })
})

describe('P6 auth — updateUser / anonymous', () => {
  test('useUpdateUser updates metadata and refreshes the cache', async () => {
    const { email, password } = await createUser()
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    const { result } = renderHook(
      () => ({ login: useLogin(), update: useUpdateUser(), user: useUser() }),
      { wrapper },
    )

    await act(async () => {
      await result.current.login.mutateAsync({ email, password })
    })
    await waitFor(() => expect(result.current.user.user?.email).toBe(email))

    let updated: unknown
    await act(async () => {
      updated = await result.current.update.mutateAsync({ data: { display_name: 'Updated' } })
    })
    expect((updated as { user_metadata: { display_name?: string } }).user_metadata.display_name).toBe(
      'Updated',
    )
    await waitFor(() =>
      expect(result.current.user.user?.user_metadata.display_name).toBe('Updated'),
    )
  })

  test('useAnonymousLogin creates an anonymous session', async () => {
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    const { result } = renderHook(() => ({ anon: useAnonymousLogin(), user: useUser() }), { wrapper })

    let session: unknown
    await act(async () => {
      session = await result.current.anon.mutateAsync()
    })
    const s = session as { user: { id: string; is_anonymous?: boolean } }
    createdUids.push(s.user.id)
    expect(s.user.is_anonymous).toBe(true)
    await waitFor(() => expect(result.current.user.user?.is_anonymous).toBe(true))
  })
})

describe('P6 auth — email flows (Inbucket / GoTrue)', () => {
  test('usePasswordRecovery dispatches a recovery email', async () => {
    const { email } = await createUser()
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    const { result } = renderHook(() => usePasswordRecovery(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ email, redirectTo: 'http://127.0.0.1:3000/reset' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  test('useMagicLink dispatches a magic-link email', async () => {
    const { email } = await createUser()
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    const { result } = renderHook(() => useMagicLink(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ email })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  test('useEmailOtp verifies a code into a session', async () => {
    const { email } = await createUser()
    const supabase = makeClient()
    const { wrapper } = setup(supabase)

    // Mint a deterministic OTP via the admin API instead of scraping Inbucket.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (error) throw error
    const token = data.properties!.email_otp

    const { result } = renderHook(() => ({ otp: useEmailOtp(), user: useUser() }), { wrapper })
    let session: unknown
    await act(async () => {
      session = await result.current.otp.verify.mutateAsync({ email, token, type: 'email' })
    })
    expect((session as { access_token: string }).access_token).toBeTruthy()
    await waitFor(() => expect(result.current.user.user?.email).toBe(email))
  })
})

describe('P6 auth — MFA / identities', () => {
  // These hooks issue auth calls that require an active session, so they are
  // mounted on an already-authenticated client (real-world usage) rather than
  // logging in after mount.
  let authed: AuthedUser
  beforeAll(async () => {
    authed = await createAuthedUser()
  })
  afterAll(async () => {
    await authed?.cleanup()
  })

  test('useMfa enrolls a TOTP factor, lists it, then unenrolls', async () => {
    const { wrapper } = setup(authed.supabase)

    const { result } = renderHook(() => useMfa(), { wrapper })
    await waitFor(() => expect(result.current.factors.isSuccess).toBe(true))

    let factorId = ''
    await act(async () => {
      const enrolled = (await result.current.enroll.mutateAsync({
        factorType: 'totp',
        friendlyName: 'test-authenticator',
      })) as { id: string; totp: { secret: string; qr_code: string } }
      factorId = enrolled.id
      expect(enrolled.totp.secret).toBeTruthy()
      expect(enrolled.totp.qr_code).toContain('data:image')
    })

    // A freshly enrolled factor is unverified, so it appears in `all` (every
    // factor) but not `totp` (which the SDK filters to verified factors only).
    await waitFor(() =>
      expect(result.current.factors.data?.all.some((f) => f.id === factorId)).toBe(true),
    )

    await act(async () => {
      await result.current.unenroll.mutateAsync({ factorId })
    })
    await waitFor(() =>
      expect(result.current.factors.data?.all.some((f) => f.id === factorId)).toBe(false),
    )
  })

  test('useIdentities lists the email identity', async () => {
    const { wrapper } = setup(authed.supabase)

    const { result } = renderHook(() => useIdentities(), { wrapper })

    await waitFor(() => expect(result.current.identities.isSuccess).toBe(true))
    const providers = (result.current.identities.data ?? []).map((i) => i.provider)
    expect(providers).toContain('email')
  })
})

describe('P6 auth — OAuth (mocked transport)', () => {
  test('useOAuthLogin forwards options and returns the authorize url', async () => {
    const calls: unknown[] = []
    const fakeClient = {
      supabase: {
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithOAuth: async (args: { provider: string }) => {
            calls.push(args)
            return { data: { provider: args.provider, url: 'https://oauth.example/authorize' }, error: null }
          },
        },
      },
    } as unknown as SupabaseHooksClient
    const { wrapper } = setup(fakeClient.supabase as unknown as SupabaseClient)

    const { result } = renderHook(() => useOAuthLogin(), { wrapper })
    let res: unknown
    await act(async () => {
      res = await result.current.mutateAsync({
        provider: 'google',
        redirectTo: 'https://app.example/callback',
      })
    })
    expect((res as { url: string }).url).toBe('https://oauth.example/authorize')
    expect(calls[0]).toMatchObject({
      provider: 'google',
      options: { redirectTo: 'https://app.example/callback' },
    })
  })
})
