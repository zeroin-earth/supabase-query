import * as React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser, makeAdminClient } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useDeviceTokens } from '../src/push/useDeviceTokens'
import { useRegisterDevice } from '../src/push/useRegisterDevice'
import { useSendPush } from '../src/push/useSendPush'
import { useUnregisterDevice } from '../src/push/useUnregisterDevice'
import { SupabaseProvider } from '../src/SupabaseProvider'

// P9b push — client-side device-token registration, tested against the live
// local `supabase start` stack as real authed users so the "own tokens" RLS is
// exercised exactly as an app would. `useSendPush` invokes the `send-push` Edge
// Function, whose invoke transport is mocked (the local runtime doesn't
// hot-serve functions — P8/P9 pattern; the send logic itself is unit-tested in
// `p9b.sender.test.ts`).

const admin = makeAdminClient()

let userA: AuthedUser
let userB: AuthedUser

beforeAll(async () => {
  ;[userA, userB] = await Promise.all([createAuthedUser(), createAuthedUser()])
})

afterAll(async () => {
  await Promise.all([userA?.cleanup(), userB?.cleanup()])
})

/** Provider wrapper over a given client (defaults to userA). */
function setup(supabase: SupabaseClient = userA.supabase) {
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

describe('P9b push — device-token registration (live)', () => {
  test('register upserts a token, list reads it back, unregister deletes it', async () => {
    const token = `expo-${Date.now()}`
    const { wrapper } = setup(userA.supabase)

    // Register.
    const register = renderHook(() => useRegisterDevice(), { wrapper })
    const created = await act(() =>
      register.result.current.mutateAsync({ token, platform: 'ios', provider: 'expo' }),
    )
    expect(created.token).toBe(token)
    expect(created.user_id).toBe(userA.uid)
    expect(created.provider).toBe('expo')

    // List (RLS-scoped to the caller).
    const list = renderHook(() => useDeviceTokens(), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    expect(list.result.current.tokens?.some((t) => t.token === token)).toBe(true)

    // Unregister.
    const unregister = renderHook(() => useUnregisterDevice(), { wrapper })
    await act(() => unregister.result.current.mutateAsync({ token }))

    const { data: after } = await admin
      .from('device_tokens')
      .select('id')
      .eq('token', token)
    expect(after).toEqual([])
  })

  test('register is idempotent on (user_id, token) — upsert, not duplicate', async () => {
    const token = `expo-idem-${Date.now()}`
    const { wrapper } = setup(userA.supabase)
    const { result } = renderHook(() => useRegisterDevice(), { wrapper })

    const first = await act(() =>
      result.current.mutateAsync({ token, platform: 'android', provider: 'expo' }),
    )
    const second = await act(() =>
      result.current.mutateAsync({ token, platform: 'android', provider: 'fcm' }),
    )
    expect(second.id).toBe(first.id) // same row, updated in place
    expect(second.provider).toBe('fcm')

    const { count } = await admin
      .from('device_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userA.uid)
      .eq('token', token)
    expect(count).toBe(1)

    await admin.from('device_tokens').delete().eq('token', token)
  })

  test('RLS isolates tokens — a user cannot see or delete another user’s token', async () => {
    const token = `expo-iso-${Date.now()}`

    // userA registers.
    const a = setup(userA.supabase)
    const registerA = renderHook(() => useRegisterDevice(), { wrapper: a.wrapper })
    await act(() =>
      registerA.result.current.mutateAsync({ token, platform: 'ios', provider: 'expo' }),
    )

    // userB cannot see it.
    const b = setup(userB.supabase)
    const listB = renderHook(() => useDeviceTokens(), { wrapper: b.wrapper })
    await waitFor(() => expect(listB.result.current.isSuccess).toBe(true))
    expect(listB.result.current.tokens?.some((t) => t.token === token)).toBe(false)

    // userB's delete of userA's token is a no-op under RLS (row stays).
    const unregisterB = renderHook(() => useUnregisterDevice(), { wrapper: b.wrapper })
    await act(() => unregisterB.result.current.mutateAsync({ token }))
    const { data: still } = await admin
      .from('device_tokens')
      .select('id')
      .eq('token', token)
    expect(still?.length).toBe(1)

    await admin.from('device_tokens').delete().eq('token', token)
  })
})

describe('P9b push — send (mocked Edge Function transport)', () => {
  test('useSendPush invokes send-push with { userIds, title, body, data }', async () => {
    const calls: { name: string; opts?: unknown }[] = []
    const fake = {
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
      functions: {
        invoke: (name: string, opts?: unknown) => {
          calls.push({ name, opts })
          return Promise.resolve({ data: { sent: 2, pruned: [] }, error: null })
        },
      },
    } as unknown as SupabaseClient
    const { wrapper } = setup(fake)

    const { result } = renderHook(() => useSendPush(), { wrapper })
    const res = await act(() =>
      result.current.mutateAsync({
        userIds: ['u1', 'u2'],
        title: 'Hi',
        body: 'there',
        data: { deepLink: '/x' },
      }),
    )

    expect(res).toEqual({ sent: 2, pruned: [] })
    expect(calls[0]?.name).toBe('send-push')
    expect(calls[0]?.opts).toMatchObject({
      body: { userIds: ['u1', 'u2'], title: 'Hi', body: 'there', data: { deepLink: '/x' } },
    })
  })
})
