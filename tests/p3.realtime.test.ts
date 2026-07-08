import { describe, expect, test } from 'bun:test'

import { subscribeToTable } from '../src/db/realtime'
import type { AnySupabaseClient } from '../src/types'

type OnArgs = [string, Record<string, unknown>, (payload: unknown) => void]

/** Mock client capturing channel/on/subscribe/removeChannel interactions. */
function makeMockRealtime() {
  const state = {
    channelName: '',
    onArgs: null as OnArgs | null,
    subscribed: false,
    removed: null as unknown,
  }
  const channel = {
    on(...args: OnArgs) {
      state.onArgs = args
      return channel
    },
    subscribe() {
      state.subscribed = true
      return channel
    },
  }
  const supabase = {
    channel(name: string) {
      state.channelName = name
      return channel
    },
    removeChannel(ch: unknown) {
      state.removed = ch
    },
  } as unknown as AnySupabaseClient
  return { supabase, channel, state, emit: (p: unknown) => state.onArgs?.[2](p) }
}

describe('subscribeToTable', () => {
  test('opens a postgres_changes channel with schema/table/filter', () => {
    const { supabase, state } = makeMockRealtime()

    subscribeToTable(supabase, { table: 'todos', filter: 'user_id=eq.1' }, () => {})

    expect(state.channelName).toBe('realtime:public:todos:user_id=eq.1')
    expect(state.subscribed).toBe(true)
    expect(state.onArgs?.[0]).toBe('postgres_changes')
    expect(state.onArgs?.[1]).toEqual({
      event: '*',
      schema: 'public',
      table: 'todos',
      filter: 'user_id=eq.1',
    })
  })

  test('omits filter from config and uses "*" in the channel name when absent', () => {
    const { supabase, state } = makeMockRealtime()

    subscribeToTable(supabase, { schema: 'analytics', table: 'events' }, () => {})

    expect(state.channelName).toBe('realtime:analytics:events:*')
    expect(state.onArgs?.[1]).toEqual({ event: '*', schema: 'analytics', table: 'events' })
  })

  test('forwards change payloads to onChange', () => {
    const { supabase, emit } = makeMockRealtime()
    const seen: unknown[] = []

    subscribeToTable(supabase, { table: 'todos' }, (p) => seen.push(p))
    const payload = { eventType: 'INSERT', new: { id: '1' }, old: {} }
    emit(payload)

    expect(seen).toEqual([payload])
  })

  test('returned cleanup removes the channel', () => {
    const { supabase, channel, state } = makeMockRealtime()

    const unsubscribe = subscribeToTable(supabase, { table: 'todos' }, () => {})
    expect(state.removed).toBeNull()
    unsubscribe()
    expect(state.removed).toBe(channel)
  })
})
