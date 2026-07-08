import { onlineManager } from '@tanstack/react-query'
import { afterAll, describe, expect, mock, test } from 'bun:test'

import { LOCAL_ANON_KEY, LOCAL_URL } from './setup/localStack'
import { createOfflineClient, hydrateMutationDefaults, Keys, mutationRegistry } from '../src'

// Pure wiring tests — no live stack. They exercise `createOfflineClient`'s
// contract (persister selection, imperative persistence, network adapter) and
// the mutation registry's shape, mirroring the Appwrite `offline/client` suite.

afterAll(() => {
  // The network-adapter test toggles the global onlineManager — restore it so
  // later suites (which assume online) are unaffected.
  onlineManager.setOnline(true)
})

const base = {
  url: LOCAL_URL,
  anonKey: LOCAL_ANON_KEY,
}

describe('P5 createOfflineClient', () => {
  test('throws if storage and persister are both provided', () => {
    expect(() =>
      createOfflineClient({
        ...base,
        networkAdapter: { listen: mock() },
        storage: localStorage,
        persister: {
          persistClient: mock(),
          restoreClient: mock(),
          removeClient: mock(),
        },
      }),
    ).toThrow('Provide either `storage` or `persister`, not both.')
  })

  test('exposes the supabase client and a configured queryClient', () => {
    const client = createOfflineClient({ ...base, networkAdapter: { listen: mock() } })

    expect(client.supabase).toBeDefined()
    expect(typeof client.supabase.from).toBe('function')
    const opts = client.queryClient.getDefaultOptions()
    expect(opts.mutations?.networkMode).toBe('offlineFirst')
    expect((opts.mutations?.meta as { conflictStrategy?: unknown })?.conflictStrategy).toBe(
      'last-write-wins',
    )
  })

  test('registers replay defaults for every row mutation key', () => {
    const client = createOfflineClient({ ...base, networkAdapter: { listen: mock() } })

    // Each registry key + the separately-registered update key must resolve to a
    // default mutationFn scoped to 'supabase'.
    const keys = [
      ...mutationRegistry.map((e) => e.mutationKey),
      Keys.schema().table('').rows().update(),
    ]
    for (const key of keys) {
      const defaults = client.queryClient.getMutationDefaults(key)
      expect(typeof defaults?.mutationFn).toBe('function')
      expect(defaults?.scope?.id).toBe('supabase')
    }
  })

  test('startPersistence returns an unsubscribe fn and a restored promise', () => {
    const client = createOfflineClient({
      ...base,
      networkAdapter: { listen: mock() },
      storage: localStorage,
    })

    const { unsubscribe, restored } = client.startPersistence()

    expect(typeof unsubscribe).toBe('function')
    expect(restored).toBeInstanceOf(Promise)
    unsubscribe()
  })

  test('startPersistence throws without a persister', () => {
    const client = createOfflineClient({ ...base, networkAdapter: { listen: mock() } })

    expect(() => client.startPersistence()).toThrow(
      'No persister configured. Provide `storage` or `persister` to createOfflineClient.',
    )
  })

  test('drives onlineManager from the network adapter', () => {
    let onlineCallback: ((isOnline: boolean) => void) | null = null

    createOfflineClient({
      ...base,
      networkAdapter: {
        listen: (callback) => {
          onlineCallback = callback
          return () => {}
        },
      },
    })

    expect(onlineManager.isOnline()).toBe(true)

    onlineCallback!(false)
    expect(onlineManager.isOnline()).toBe(false)

    onlineCallback!(true)
    expect(onlineManager.isOnline()).toBe(true)
  })
})

describe('P5 mutation registry', () => {
  test('covers row create/delete/upsert/increment/decrement and no auth entries', () => {
    const keys = mutationRegistry.map((e) => e.mutationKey.join('.'))

    expect(keys).toContain(Keys.schema().table('').rows().create().join('.'))
    expect(keys).toContain(Keys.schema().table('').rows().delete().join('.'))
    expect(keys).toContain(Keys.schema().table('').rows().upsert().join('.'))
    expect(keys).toContain([...Keys.schema().table('').rows().key(), 'incrementColumn'].join('.'))
    expect(keys).toContain([...Keys.schema().table('').rows().key(), 'decrementColumn'].join('.'))

    // Auth mutations are online-only and must NOT be queueable (migration §6.5).
    expect(keys.some((k) => k.includes('auth'))).toBe(false)
    // The update key is registered separately (conflict-aware), not in the array.
    expect(keys).not.toContain(Keys.schema().table('').rows().update().join('.'))
  })

  test('hydrateMutationDefaults is idempotent-safe on a bare QueryClient', () => {
    const client = createOfflineClient({ ...base, networkAdapter: { listen: mock() } })
    // Re-hydrating should not throw and keeps the update default in place.
    hydrateMutationDefaults(client.queryClient, client.supabase, {
      conflictStrategy: 'server-wins',
    })
    const upd = client.queryClient.getMutationDefaults(Keys.schema().table('').rows().update())
    expect(typeof upd?.mutationFn).toBe('function')
  })
})
