import * as React from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { onlineManager, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test'

import { LOCAL_ANON_KEY, LOCAL_URL, makeAdminClient } from './setup/localStack'
import type { SupabaseHooksClient } from '../src/client'
import { useCreateRow } from '../src/db/useCreateRow'
import { useUpdateRow } from '../src/db/useUpdateRow'
import type { ConflictStrategy } from '../src/offline/conflictResolution/types'
import { createOfflineClient } from '../src/offline/createOfflineClient'
import { Keys } from '../src/query/Keys'
import { SupabaseProvider } from '../src/SupabaseProvider'

const OFFLINE_CACHE_KEY = 'supabase-query-offline-cache'

type Todo = {
  id: string
  user_id: string
  title: string
  done: boolean
  priority: number
  created_at: string
  updated_at: string
}

const admin = makeAdminClient()
// A second authenticated client acting as "another device": it lands remote
// changes on the server and handles row cleanup. The fixture grants DML to the
// `authenticated` role (not `service_role`), and RLS permits own-row writes, so
// an authed user client — not the service-role admin — is the right tool here.
let userClient: SupabaseClient
let email: string
let password: string
let uid: string
const createdIds: string[] = []

beforeAll(async () => {
  email = `p5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  password = 'password123'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  uid = data.user!.id

  userClient = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw signInErr
})

afterEach(() => {
  // Leave the shared onlineManager online and drop any persisted offline cache so
  // each test starts clean and later suites aren't left offline.
  onlineManager.setOnline(true)
  localStorage.removeItem(OFFLINE_CACHE_KEY)
})

afterAll(async () => {
  if (createdIds.length) await userClient.from('todos').delete().in('id', createdIds)
  await userClient.auth.signOut()
  await admin.auth.admin.deleteUser(uid)
})

/** An authenticated offline client + a provider wrapper over its queryClient. */
async function setupOffline(opts: {
  conflictStrategy?: ConflictStrategy
  storage?: Storage
} = {}) {
  const offline = createOfflineClient({
    url: LOCAL_URL,
    anonKey: LOCAL_ANON_KEY,
    networkAdapter: { listen: mock() },
    storage: opts.storage,
    throttleTime: 0,
    conflictStrategy: opts.conflictStrategy,
  })

  // Paused-mutation behaviour needs networkMode 'online'; preserve the meta
  // (carries conflictStrategy) that createOfflineClient set as a default.
  const defaults = offline.queryClient.getDefaultOptions()
  offline.queryClient.setDefaultOptions({
    ...defaults,
    mutations: { ...defaults.mutations, networkMode: 'online' },
  })

  const { error } = await offline.supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SupabaseProvider
      client={{ supabase: offline.supabase } as SupabaseHooksClient}
      queryClient={offline.queryClient}
    >
      {children}
    </SupabaseProvider>
  )

  return { offline, supabase: offline.supabase, queryClient: offline.queryClient, wrapper }
}

/** Neutralize any still-paused mutations so their retryers don't fire real
 * requests when a later test flips onlineManager back online. */
function neutralize(queryClient: QueryClient) {
  for (const m of queryClient.getMutationCache().getAll()) {
    m.setOptions({ ...m.options, mutationFn: () => Promise.resolve(undefined) })
  }
  queryClient.getMutationCache().clear()
  queryClient.unmount()
}

/** Create a row (online) and return it, seeding the row cache as the conflict base. */
async function createBaseRow(
  wrapper: React.ComponentType<{ children: React.ReactNode }>,
  values: Partial<Todo>,
): Promise<Todo> {
  const { result } = renderHook(() => useCreateRow<Todo, Partial<Todo>>(), { wrapper })
  await act(async () => {
    result.current.mutate({ table: 'todos', values: { user_id: uid, ...values } })
  })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  const row = result.current.data!
  createdIds.push(row.id)
  return row
}

describe('P5 offline — queue & replay', () => {
  test('a create paused while offline runs on reconnect', async () => {
    const { supabase, wrapper } = await setupOffline()
    const id = crypto.randomUUID()
    createdIds.push(id)

    onlineManager.setOnline(false)
    const { result } = renderHook(() => useCreateRow<Todo, Partial<Todo>>(), { wrapper })

    await act(async () => {
      result.current.mutate({ table: 'todos', values: { id, user_id: uid, title: 'queued' } })
    })
    await waitFor(() => expect(result.current.isPaused).toBe(true))

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { data } = await supabase.from('todos').select().eq('id', id).single()
    expect((data as Todo).title).toBe('queued')
  })

  test('paused mutations persist to storage and replay after restart', async () => {
    localStorage.removeItem(OFFLINE_CACHE_KEY)
    const id = crypto.randomUUID()
    createdIds.push(id)

    // --- session 1: go offline, queue a create, let it persist, then tear down
    const s1 = await setupOffline({ storage: localStorage })
    const { unsubscribe } = s1.offline.startPersistence()

    onlineManager.setOnline(false)
    const { result } = renderHook(() => useCreateRow<Todo, Partial<Todo>>(), {
      wrapper: s1.wrapper,
    })
    await act(async () => {
      result.current.mutate({ table: 'todos', values: { id, user_id: uid, title: 'restart-me' } })
    })
    await waitFor(() => expect(result.current.isPaused).toBe(true))
    await new Promise((r) => setTimeout(r, 50)) // let the persister flush

    const persisted = localStorage.getItem(OFFLINE_CACHE_KEY)
    expect(persisted).toBeTruthy()
    const mutationKeys = JSON.parse(persisted!).clientState.mutations.map(
      (m: { mutationKey: string[] }) => m.mutationKey.join('.'),
    )
    expect(mutationKeys).toContain(Keys.schema().table('').rows().create().join('.'))

    unsubscribe()
    neutralize(s1.queryClient)

    // --- session 2: fresh client restores the cache and replays the create
    onlineManager.setOnline(true)
    const s2 = await setupOffline({ storage: localStorage })
    const { restored } = s2.offline.startPersistence()
    await restored

    await waitFor(
      () => {
        const unfinished = s2.queryClient
          .getMutationCache()
          .getAll()
          .filter((m) => m.state.status === 'pending' || m.state.isPaused)
        expect(unfinished.length).toBe(0)
      },
      { timeout: 12_000 },
    )

    const { data } = await s2.supabase.from('todos').select().eq('id', id).single()
    expect((data as Todo).title).toBe('restart-me')
  }, 20_000)
})

describe('P5 offline — conflict resolution', () => {
  /** Runs the shared conflict scenario: create base online, update offline,
   * remote change lands, reconnect → resolve. Returns the final server row. */
  async function runConflict(opts: {
    conflictStrategy: ConflictStrategy
    base: Partial<Todo>
    offlinePatch: Partial<Todo>
    remotePatch: Partial<Todo>
  }): Promise<Todo> {
    const { supabase, wrapper } = await setupOffline({ conflictStrategy: opts.conflictStrategy })
    const row = await createBaseRow(wrapper, opts.base)

    onlineManager.setOnline(false)
    const { result } = renderHook(() => useUpdateRow<Todo, Partial<Todo>>(), { wrapper })
    await act(async () => {
      result.current.mutate({ table: 'todos', id: row.id, values: opts.offlinePatch })
    })
    await waitFor(() => expect(result.current.isPaused).toBe(true))

    // A different client changes the row while we're offline.
    const { error: remoteErr } = await userClient
      .from('todos')
      .update(opts.remotePatch)
      .eq('id', row.id)
    if (remoteErr) throw remoteErr
    await new Promise((r) => setTimeout(r, 50))

    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const { data } = await supabase.from('todos').select().eq('id', row.id).single()
    return data as Todo
  }

  test('server-wins keeps the remote change', async () => {
    const final = await runConflict({
      conflictStrategy: 'server-wins',
      base: { title: 'Original', priority: 20 },
      offlinePatch: { title: 'Offline Update', priority: 21 },
      remotePatch: { title: 'Remote Update', priority: 22 },
    })
    expect(final.title).toBe('Remote Update')
    expect(final.priority).toBe(22)
  }, 15_000)

  test('last-write-wins keeps the offline change', async () => {
    const final = await runConflict({
      conflictStrategy: 'last-write-wins',
      base: { title: 'Original', priority: 20 },
      offlinePatch: { title: 'Offline Update', priority: 21 },
      remotePatch: { title: 'Remote Update', priority: 22 },
    })
    expect(final.title).toBe('Offline Update')
    expect(final.priority).toBe(21)
  }, 15_000)

  test('merge-shallow merges disjoint local + remote changes', async () => {
    const final = await runConflict({
      conflictStrategy: 'merge-shallow',
      base: { title: 'Original', priority: 20 },
      offlinePatch: { title: 'Offline Update' }, // local touches title only
      remotePatch: { priority: 22 }, // remote touches priority only
    })
    expect(final.title).toBe('Offline Update')
    expect(final.priority).toBe(22)
  }, 15_000)
})
