import * as React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useFunction } from '../src/functions/useFunction'
import { useCallRpc, useRpc } from '../src/functions/useRpc'
import { SupabaseProvider } from '../src/SupabaseProvider'

type Todo = { id: string; user_id: string; title: string; priority: number }

let authed: AuthedUser

beforeAll(async () => {
  authed = await createAuthedUser()
})

afterAll(async () => {
  await authed?.cleanup()
})

/** Fresh QueryClient + provider wrapper. Defaults to the live authed client;
 * pass a fake `supabase` for the mocked-transport invoke tests. */
function setup(supabase: SupabaseClient = authed.supabase) {
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

async function seedTodo(overrides: Partial<Todo> = {}): Promise<Todo> {
  const { data, error } = await authed.supabase
    .from('todos')
    .insert({ user_id: authed.uid, title: 'seed', ...overrides })
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

describe('P8 functions — Postgres RPC (live)', () => {
  test('useCallRpc invokes a mutating function (increment_column)', async () => {
    const row = await seedTodo({ title: 'rpc-inc', priority: 5 })
    const { wrapper } = setup()

    const { result } = renderHook(() => useCallRpc('increment_column'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        p_table: 'todos',
        p_id: row.id,
        p_column: 'priority',
        p_amount: 3,
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { data } = await authed.supabase.from('todos').select().eq('id', row.id).single()
    expect((data as Todo).priority).toBe(8)
  })

  test('useRpc calls a read-only function (places_within) as a query', async () => {
    const name = `rpc-place-${Date.now()}`
    const { error: insertErr } = await authed.supabase
      .from('places')
      .insert({ name, location: 'SRID=4326;POINT(-73.9 40.7)' })
    expect(insertErr).toBeNull()

    const { wrapper } = setup()
    const { result } = renderHook(
      () => useRpc<{ id: string; name: string }[]>('places_within', { p_lat: 40.7, p_lng: -73.9, p_meters: 2000 }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.some((p) => p.name === name)).toBe(true)
  })

  test('useCallRpc surfaces the Postgres error', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useCallRpc('does_not_exist'), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync({})).rejects.toBeDefined()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('P8 functions — Edge Function invoke (mocked transport)', () => {
  /** A fake client exposing just `functions.invoke` + the provider's auth hook. */
  function fakeClient(invoke: (name: string, opts?: unknown) => Promise<unknown>) {
    const calls: { name: string; opts?: unknown }[] = []
    const supabase = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      functions: {
        invoke: (name: string, opts?: unknown) => {
          calls.push({ name, opts })
          return invoke(name, opts)
        },
      },
    } as unknown as SupabaseClient
    return { supabase, calls }
  }

  test('useFunction forwards name + options and unwraps data', async () => {
    const { supabase, calls } = fakeClient(async () => ({
      data: { echo: { hello: 'world' } },
      error: null,
    }))
    const { wrapper } = setup(supabase)

    const { result } = renderHook(() => useFunction<{ echo: unknown }>(), { wrapper })
    let res: { echo: unknown } | undefined
    await act(async () => {
      res = await result.current.mutateAsync({ name: 'echo', body: { hello: 'world' } })
    })

    expect(res).toEqual({ echo: { hello: 'world' } })
    expect(calls[0]?.name).toBe('echo')
    expect(calls[0]?.opts).toMatchObject({ body: { hello: 'world' } })
  })

  test('useFunction throws when the invocation errors', async () => {
    const { supabase } = fakeClient(async () => ({
      data: null,
      error: new Error('boom'),
    }))
    const { wrapper } = setup(supabase)

    const { result } = renderHook(() => useFunction(), { wrapper })
    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'broken' })).rejects.toThrow('boom')
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
