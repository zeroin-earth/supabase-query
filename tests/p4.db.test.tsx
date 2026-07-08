import * as React from 'react'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { type AuthedUser,createAuthedUser } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useCreateRow } from '../src/db/useCreateRow'
import { useDecrementColumn } from '../src/db/useDecrementColumn'
import { useDeleteRow } from '../src/db/useDeleteRow'
import { useIncrementColumn } from '../src/db/useIncrementColumn'
import { useRow } from '../src/db/useRow'
import { useRows } from '../src/db/useRows'
import { useRowsWithPagination } from '../src/db/useRowsWithPagination'
import { useUpdateRow } from '../src/db/useUpdateRow'
import { useUpsertRow } from '../src/db/useUpsertRow'
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

let authed: AuthedUser

beforeAll(async () => {
  authed = await createAuthedUser()
})

afterAll(async () => {
  await authed?.cleanup()
})

/** Fresh QueryClient + provider wrapper bound to the authenticated client. */
function setup() {
  const queryClient = new QueryClient({
    // gcTime Infinity so cache entries seeded by mutations (which have no active
    // observer) survive long enough to assert on them.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
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

/** Insert a todo directly (test setup), bypassing the hooks under test. */
async function seedTodo(overrides: Partial<Todo> = {}): Promise<Todo> {
  const { data, error } = await authed.supabase
    .from('todos')
    .insert({ user_id: authed.uid, title: 'seed', ...overrides })
    .select()
    .single()
  if (error) throw error
  return data as Todo
}

describe('P4 db — reads', () => {
  test('useRow fetches a single row by id', async () => {
    const row = await seedTodo({ title: 'read-one' })
    const { wrapper } = setup()

    const { result } = renderHook(() => useRow<Todo>('todos', row.id, { subscribe: false }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.row?.title).toBe('read-one')
    expect(result.current.data?.id).toBe(row.id)
  })

  test('useRows returns filtered rows + exact total', async () => {
    const marker = `list-${Date.now()}`
    await seedTodo({ title: marker, done: false })
    await seedTodo({ title: marker, done: true })
    const { wrapper } = setup()

    const { result } = renderHook(
      () => useRows<Todo>('todos', (q) => q.eq('title', marker), { subscribe: false }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.total).toBe(2)
    expect(result.current.rows).toHaveLength(2)
  })
})

describe('P4 db — writes', () => {
  test('useCreateRow inserts and seeds the row cache', async () => {
    const { wrapper, queryClient } = setup()
    const { result } = renderHook(() => useCreateRow<Todo, Partial<Todo>>(), { wrapper })

    result.current.mutate({ table: 'todos', values: { user_id: authed.uid, title: 'created' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const created = result.current.data!
    expect(created.title).toBe('created')

    const cached = queryClient.getQueryData<Todo>(
      Keys.schema().table('todos').row(created.id).key(),
    )
    expect(cached?.title).toBe('created')
  })

  test('useUpdateRow patches a row (server + cache)', async () => {
    const row = await seedTodo({ title: 'before', priority: 1 })
    const { wrapper, queryClient } = setup()
    const { result } = renderHook(() => useUpdateRow<Todo, Partial<Todo>>(), { wrapper })

    result.current.mutate({ table: 'todos', id: row.id, values: { title: 'after' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.title).toBe('after')
    // updated_at trigger bumped it
    expect(result.current.data?.updated_at).not.toBe(row.updated_at)

    // confirm persisted
    const { data } = await authed.supabase.from('todos').select().eq('id', row.id).single()
    expect((data as Todo).title).toBe('after')
    void queryClient
  })

  test('useUpdateRow rolls back the optimistic patch on error', async () => {
    const row = await seedTodo({ title: 'keep-me' })
    const { wrapper, queryClient } = setup()
    const rowKey = Keys.schema().table('todos').row(row.id).key()
    queryClient.setQueryData(rowKey, row)

    const { result } = renderHook(() => useUpdateRow<Todo, Partial<Todo>>(), { wrapper })

    // title is NOT NULL — this write is rejected by the DB, forcing a rollback.
    result.current.mutate({
      table: 'todos',
      id: row.id,
      values: { title: null as unknown as string },
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData<Todo>(rowKey)?.title).toBe('keep-me')
  })

  test('useUpsertRow inserts then updates the same id', async () => {
    const id = crypto.randomUUID()
    const { wrapper } = setup()
    const { result } = renderHook(() => useUpsertRow<Todo, Partial<Todo>>(), { wrapper })

    result.current.mutate({ table: 'todos', values: { id, user_id: authed.uid, title: 'v1' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.title).toBe('v1')

    result.current.mutate({ table: 'todos', values: { id, user_id: authed.uid, title: 'v2' } })
    await waitFor(() => expect(result.current.data?.title).toBe('v2'))

    const { count } = await authed.supabase
      .from('todos')
      .select('*', { count: 'exact', head: true })
      .eq('id', id)
    expect(count).toBe(1)
  })

  test('useDeleteRow removes the row (optimistic + server)', async () => {
    const row = await seedTodo({ title: 'delete-me' })
    const { wrapper, queryClient } = setup()
    const rowKey = Keys.schema().table('todos').row(row.id).key()
    queryClient.setQueryData(rowKey, row)

    const { result } = renderHook(() => useDeleteRow(), { wrapper })
    result.current.mutate({ table: 'todos', id: row.id })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(rowKey)).toBeUndefined()

    const { data } = await authed.supabase.from('todos').select().eq('id', row.id).maybeSingle()
    expect(data).toBeNull()
  })
})

describe('P4 db — increment / decrement (RPC)', () => {
  test('useIncrementColumn bumps a numeric column', async () => {
    const row = await seedTodo({ title: 'inc', priority: 5 })
    const { wrapper } = setup()
    const { result } = renderHook(() => useIncrementColumn(), { wrapper })

    result.current.mutate({ table: 'todos', id: row.id, column: 'priority', amount: 3 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { data } = await authed.supabase.from('todos').select().eq('id', row.id).single()
    expect((data as Todo).priority).toBe(8)
  })

  test('useDecrementColumn lowers a numeric column', async () => {
    const row = await seedTodo({ title: 'dec', priority: 10 })
    const { wrapper } = setup()
    const { result } = renderHook(() => useDecrementColumn(), { wrapper })

    result.current.mutate({ table: 'todos', id: row.id, column: 'priority', amount: 4 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { data } = await authed.supabase.from('todos').select().eq('id', row.id).single()
    expect((data as Todo).priority).toBe(6)
  })
})

describe('P4 db — pagination', () => {
  test('useRowsWithPagination walks pages via .range()', async () => {
    const marker = `page-${Date.now()}`
    await seedTodo({ title: marker, priority: 1 })
    await seedTodo({ title: marker, priority: 2 })
    await seedTodo({ title: marker, priority: 3 })
    const { wrapper } = setup()

    const { result } = renderHook(
      () =>
        useRowsWithPagination<Todo>(
          'todos',
          (q) => q.eq('title', marker).order('priority', { ascending: true }),
          { limit: 2, subscribe: false },
        ),
      { wrapper },
    )

    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0))
    expect(result.current.total).toBe(3)
    expect(result.current.rows).toHaveLength(2)
    expect(result.current.hasNextPage).toBe(true)

    result.current.nextPage()
    await waitFor(() => expect(result.current.page).toBe(2))
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    expect(result.current.hasNextPage).toBe(false)
    expect(result.current.hasPreviousPage).toBe(true)
  })
})

describe('P4 db — PostGIS geo routing', () => {
  type Place = { id: string; name: string; location: unknown; created_at: string }

  test('useRows routes a distance predicate to the spatial RPC', async () => {
    await authed.supabase
      .from('places')
      .insert({ name: `geo-${Date.now()}`, location: 'SRID=4326;POINT(-73.9 40.7)' })
    const { wrapper } = setup()

    const { result } = renderHook(
      () =>
        useRows<Place>('places', (q) => q.distanceLessThan('location', 40.7, -73.9, 2000), {
          subscribe: false,
          geoRpc: 'places_within',
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect((result.current.rows?.length ?? 0)).toBeGreaterThanOrEqual(1)
  })
})
