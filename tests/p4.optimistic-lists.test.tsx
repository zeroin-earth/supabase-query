import * as React from 'react'
import { onlineManager, QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser, createAuthedUser } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import {
  findCachedRow,
  patchRow,
  reinsertRowIntoLists,
  removeRowFromLists,
} from '../src/db/optimisticRows'
import { useDeleteRow } from '../src/db/useDeleteRow'
import { useIncrementColumn } from '../src/db/useIncrementColumn'
import { useRows } from '../src/db/useRows'
import { useUpdateRow } from '../src/db/useUpdateRow'
import { Keys } from '../src/query/Keys'
import { SupabaseProvider } from '../src/SupabaseProvider'

type Todo = {
  id: string
  user_id: string
  title: string
  done: boolean
  priority: number
  created_at: string
  updated_at: string
}

// Every optimistic write must reach the *list* caches, not just the single-row
// entry: a screen built from `useRows` renders lists, and a mutation paused
// offline never reaches `onSettled` to invalidate them. Patching only the row key
// would make an offline edit invisible until reconnect.

describe('P4 optimistic — list cache helpers', () => {
  const target = { schema: 'public', table: 'todos', id: 'b' }

  /** The key `getRowsQuery` builds: the shared prefix plus the filter variant. */
  function listKey(ops: unknown[] = []) {
    return [...Keys.schema('public').table('todos').rows().key(), { ops, select: '*' }]
  }

  function seededClient() {
    const queryClient = new QueryClient()
    queryClient.setQueryData(listKey(), {
      total: 3,
      rows: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
    })
    return queryClient
  }

  test('findCachedRow falls back to a cached list when no row entry exists', () => {
    const queryClient = seededClient()

    expect(queryClient.getQueryData(Keys.schema().table('todos').row('b').key())).toBeUndefined()
    expect(findCachedRow(queryClient, target)).toEqual({ id: 'b', title: 'B' })
  })

  test('findCachedRow prefers the single-row entry over the list copy', () => {
    const queryClient = seededClient()
    queryClient.setQueryData(Keys.schema().table('todos').row('b').key(), {
      id: 'b',
      title: 'fresher',
    })

    expect(findCachedRow(queryClient, target)?.title).toBe('fresher')
  })

  test('patchRow updates every filter variant of the list', () => {
    const queryClient = seededClient()
    queryClient.setQueryData(listKey([{ kind: 'postgrest', fn: 'eq', args: ['done', false] }]), {
      total: 1,
      rows: [{ id: 'b', title: 'B' }],
    })

    patchRow(queryClient, target, { title: 'patched' })

    for (const [, data] of queryClient.getQueriesData<{ rows: Todo[] }>({
      queryKey: Keys.schema('public').table('todos').rows().key(),
    })) {
      expect(data!.rows.find((row) => row.id === 'b')!.title).toBe('patched')
    }
  })

  test('patchRow leaves other rows and the single-row entry alone when absent', () => {
    const queryClient = seededClient()

    patchRow(queryClient, target, { title: 'patched' })

    const list = queryClient.getQueryData<{ total: number; rows: Todo[] }>(listKey())!
    expect(list.rows.map((row) => row.title)).toEqual(['A', 'patched', 'C'])
    expect(list.total).toBe(3)
    // The row key had no entry; an optimistic write must not conjure one.
    expect(queryClient.getQueryData(Keys.schema().table('todos').row('b').key())).toBeUndefined()
  })

  test('removeRowFromLists drops the row and decrements total', () => {
    const queryClient = seededClient()

    const positions = removeRowFromLists(queryClient, target)

    const list = queryClient.getQueryData<{ total: number; rows: Todo[] }>(listKey())!
    expect(list.rows.map((row) => row.id)).toEqual(['a', 'c'])
    expect(list.total).toBe(2)
    expect(positions).toHaveLength(1)
    expect(positions[0]![1]).toBe(1)
  })

  test('reinsertRowIntoLists restores the row at its original index', () => {
    const queryClient = seededClient()
    const removed = findCachedRow(queryClient, target)!
    const positions = removeRowFromLists(queryClient, target)

    reinsertRowIntoLists(queryClient, positions, removed)

    const list = queryClient.getQueryData<{ total: number; rows: Todo[] }>(listKey())!
    expect(list.rows.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(list.total).toBe(3)
  })
})

describe('P4 optimistic — hooks patch cached lists', () => {
  let authed: AuthedUser

  beforeAll(async () => {
    authed = await createAuthedUser()
  })

  afterEach(() => {
    onlineManager.setOnline(true)
  })

  afterAll(async () => {
    await authed?.cleanup()
  })

  function setup() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        // networkMode 'online' is what makes a mutation *pause* while offline
        // rather than fire and fail.
        mutations: { retry: false, networkMode: 'online' },
      },
    })
    const client = { supabase: authed.supabase } as SupabaseHooksClient
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

  /** A list read scoped to one row, plus the mutation hooks, in one tree. */
  function renderList<T>(
    id: string,
    wrapper: React.ComponentType<{ children: React.ReactNode }>,
    useMutationHook: () => T,
  ) {
    return renderHook(
      () => ({
        list: useRows<Todo>('todos', (q) => q.eq('id', id), { subscribe: false }),
        mutation: useMutationHook(),
      }),
      { wrapper },
    )
  }

  test('useUpdateRow patches the cached list while the mutation is paused offline', async () => {
    const row = await seedTodo({ title: 'offline-edit', done: false })
    const { wrapper } = setup()

    const { result } = renderList(row.id, wrapper, () => useUpdateRow<Todo, Partial<Todo>>())
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.rows?.[0]?.done).toBe(false)

    onlineManager.setOnline(false)
    await act(async () => {
      result.current.mutation.mutate({ table: 'todos', id: row.id, values: { done: true } })
    })
    await waitFor(() => expect(result.current.mutation.isPaused).toBe(true))

    // No server round trip has happened, and none can — this is purely the
    // optimistic patch reaching the list.
    expect(result.current.list.rows?.[0]?.done).toBe(true)

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
  }, 15_000)

  test('useUpdateRow rolls the cached list back when the write is rejected', async () => {
    const row = await seedTodo({ title: 'keep-me' })
    const { wrapper } = setup()

    const { result } = renderList(row.id, wrapper, () => useUpdateRow<Todo, Partial<Todo>>())
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    // title is NOT NULL — the DB rejects this, forcing a rollback.
    await act(async () => {
      result.current.mutation.mutate({
        table: 'todos',
        id: row.id,
        values: { title: null as unknown as string },
      })
    })
    await waitFor(() => expect(result.current.mutation.isError).toBe(true))

    expect(result.current.list.rows?.[0]?.title).toBe('keep-me')
  }, 15_000)

  test('useDeleteRow removes the row from the cached list while paused offline', async () => {
    const row = await seedTodo({ title: 'delete-me' })
    const { wrapper } = setup()

    const { result } = renderList(row.id, wrapper, () => useDeleteRow())
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.rows).toHaveLength(1)

    onlineManager.setOnline(false)
    await act(async () => {
      result.current.mutation.mutate({ table: 'todos', id: row.id })
    })
    await waitFor(() => expect(result.current.mutation.isPaused).toBe(true))

    expect(result.current.list.rows).toHaveLength(0)
    expect(result.current.list.total).toBe(0)

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
  }, 15_000)

  test('useIncrementColumn bumps the cached list value while paused offline', async () => {
    const row = await seedTodo({ title: 'inc-list', priority: 5 })
    const { wrapper } = setup()

    const { result } = renderList(row.id, wrapper, () => useIncrementColumn())
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    onlineManager.setOnline(false)
    await act(async () => {
      result.current.mutation.mutate({
        table: 'todos',
        id: row.id,
        column: 'priority',
        amount: 3,
      })
    })
    await waitFor(() => expect(result.current.mutation.isPaused).toBe(true))

    expect(result.current.list.rows?.[0]?.priority).toBe(8)

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true))
  }, 15_000)
})
