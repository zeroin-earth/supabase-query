import * as React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { render, renderHook, waitFor } from '@testing-library/react'
import { expect, test } from 'bun:test'

import type { SupabaseHooksClient } from '../src/client'
import { AUTH_USER_QUERY_KEY } from '../src/index.shared'
import { SupabaseProvider } from '../src/SupabaseProvider'
import { useMutation } from '../src/useMutation'
import { useQuery } from '../src/useQuery'

type AuthCallback = (event: string, session: { user: unknown } | null) => void

/** Minimal mocked client exposing only what the provider touches. */
function makeMockClient() {
  let cb: AuthCallback | null = null
  let unsubscribed = false
  const client = {
    supabase: {
      auth: {
        onAuthStateChange: (fn: AuthCallback) => {
          cb = fn
          return { data: { subscription: { unsubscribe: () => (unsubscribed = true) } } }
        },
      },
    },
  } as unknown as SupabaseHooksClient
  return {
    client,
    emit: (event: string, session: { user: unknown } | null) => cb?.(event, session),
    wasUnsubscribed: () => unsubscribed,
  }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

test('SupabaseProvider renders its children', () => {
  const { client } = makeMockClient()
  const { getByText } = render(
    <SupabaseProvider client={client} queryClient={makeQueryClient()}>
      <div>hello</div>
    </SupabaseProvider>,
  )
  expect(getByText('hello')).toBeDefined()
})

test('useQuery resolves against a mocked client', async () => {
  const { client } = makeMockClient()
  const queryClient = makeQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider client={client} queryClient={queryClient}>
      {children}
    </SupabaseProvider>
  )

  const { result } = renderHook(
    () => useQuery({ queryKey: ['thing'], queryFn: async () => 42 }),
    { wrapper },
  )

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBe(42)
})

test('useMutation runs against a mocked client', async () => {
  const { client } = makeMockClient()
  const queryClient = makeQueryClient()
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider client={client} queryClient={queryClient}>
      {children}
    </SupabaseProvider>
  )

  const { result } = renderHook(
    () => useMutation({ mutationFn: async (n: number) => n * 2 }),
    { wrapper },
  )

  result.current.mutate(21)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBe(42)
})

test('onAuthStateChange mirrors the user into the query cache', async () => {
  const { client, emit, wasUnsubscribed } = makeMockClient()
  const queryClient = makeQueryClient()
  const { unmount } = render(
    <SupabaseProvider client={client} queryClient={queryClient}>
      <div />
    </SupabaseProvider>,
  )

  const user = { id: 'u1' }
  emit('SIGNED_IN', { user })
  await waitFor(() =>
    expect(queryClient.getQueryData<typeof user | null>(AUTH_USER_QUERY_KEY)).toEqual(user),
  )

  // SIGNED_OUT clears the cache
  emit('SIGNED_OUT', null)
  await waitFor(() =>
    expect(queryClient.getQueryData<typeof user | null>(AUTH_USER_QUERY_KEY)).toBeUndefined(),
  )

  unmount()
  expect(wasUnsubscribed()).toBe(true)
})
