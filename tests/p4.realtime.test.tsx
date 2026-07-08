import * as React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, expect, test } from 'bun:test'

import { type AuthedUser,createAuthedUser } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useRows } from '../src/db/useRows'
import { SupabaseProvider } from '../src/SupabaseProvider'

type Todo = { id: string; user_id: string; title: string; done: boolean; priority: number }

let authed: AuthedUser

beforeAll(async () => {
  authed = await createAuthedUser()
})

afterAll(async () => {
  await authed?.cleanup()
})

test(
  'useRows receives realtime inserts against the local stack',
  async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const client = { supabase: authed.supabase } as SupabaseHooksClient
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SupabaseProvider client={client} queryClient={queryClient}>
        {children}
      </SupabaseProvider>
    )

    const marker = `rt-${Date.now()}`
    const { result } = renderHook(
      () => useRows<Todo>('todos', (q) => q.eq('title', marker), { subscribe: true }),
      { wrapper },
    )

    // Initial fetch: no rows match the fresh marker yet.
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.rows).toHaveLength(0)

    // Give the channel a moment to reach SUBSCRIBED, then insert out-of-band.
    await new Promise((r) => setTimeout(r, 1500))
    const { error } = await authed.supabase
      .from('todos')
      .insert({ user_id: authed.uid, title: marker })
    expect(error).toBeNull()

    // The realtime handler invalidates the list, which refetches and now
    // includes the inserted row.
    await waitFor(() => expect(result.current.rows?.length ?? 0).toBeGreaterThanOrEqual(1), {
      timeout: 15000,
    })
  },
  20000,
)
