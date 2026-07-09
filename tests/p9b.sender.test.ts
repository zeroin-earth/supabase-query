import { describe, expect, test } from 'bun:test'

import {
  chunk,
  type DeviceRow,
  dispatchPush,
  type FetchLike,
  isFcmTokenDead,
  makeExpoSender,
  makeFcmSender,
  parseExpoReceipts,
  type ProviderSender,
} from '../supabase/functions/send-push/sender'

// P9b — unit tests for the `send-push` Edge Function's pure core. The live edge
// runtime doesn't hot-serve functions (P8/P9 pattern), so the transport is
// mocked: fake `fetch`es stand in for the Expo Push API + FCM v1, and we assert
// provider branching + that dead-token receipts are surfaced for pruning.

/** A fake fetch that returns a fixed status + JSON, recording the requests. */
function fakeFetch(
  responder: (url: string, init?: Parameters<FetchLike>[1]) => { status?: number; json: unknown },
): { fetch: FetchLike; calls: { url: string; body?: string }[] } {
  const calls: { url: string; body?: string }[] = []
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body })
    const { status = 200, json } = responder(url, init)
    return { ok: status >= 200 && status < 300, status, json: async () => json }
  }
  return { fetch, calls }
}

describe('P9b send-push core — helpers', () => {
  test('chunk splits into batches of at most N', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 100)).toEqual([])
  })

  test('parseExpoReceipts flags only DeviceNotRegistered tokens, aligned by index', () => {
    const tokens = ['a', 'b', 'c']
    const json = {
      data: [
        { status: 'ok', id: '1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
        { status: 'error', details: { error: 'MessageTooBig' } },
      ],
    }
    expect(parseExpoReceipts(tokens, json)).toEqual(['b'])
    expect(parseExpoReceipts(tokens, {})).toEqual([])
  })

  test('isFcmTokenDead treats 404 / UNREGISTERED / NOT_FOUND as dead', () => {
    expect(isFcmTokenDead(404, {})).toBe(true)
    expect(isFcmTokenDead(400, { error: { status: 'UNREGISTERED' } })).toBe(true)
    expect(isFcmTokenDead(400, { error: { status: 'NOT_FOUND' } })).toBe(true)
    expect(isFcmTokenDead(500, { error: { status: 'INTERNAL' } })).toBe(false)
  })
})

describe('P9b send-push core — provider senders', () => {
  test('makeExpoSender posts to the Expo endpoint and returns dead tokens', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      json: { data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] },
    }))
    const sender = makeExpoSender(fetch)
    const { deadTokens } = await sender(['tok-ok', 'tok-dead'], { title: 'Hi', body: 'yo' })

    expect(deadTokens).toEqual(['tok-dead'])
    expect(calls[0]?.url).toContain('exp.host')
    expect(JSON.parse(calls[0]!.body!)).toEqual([
      { to: 'tok-ok', title: 'Hi', body: 'yo', data: undefined },
      { to: 'tok-dead', title: 'Hi', body: 'yo', data: undefined },
    ])
  })

  test('makeExpoSender chunks batches larger than 100', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { data: [] } }))
    const sender = makeExpoSender(fetch)
    const tokens = Array.from({ length: 250 }, (_, i) => `t${i}`)
    await sender(tokens, {})
    expect(calls.length).toBe(3) // 100 + 100 + 50
  })

  test('makeFcmSender sends per-token to the project endpoint and prunes 404s', async () => {
    const { fetch, calls } = fakeFetch((_url, init) => {
      const token = JSON.parse(init!.body!).message.token as string
      return token === 'dead' ? { status: 404, json: { error: { status: 'UNREGISTERED' } } } : { json: {} }
    })
    const sender = makeFcmSender(fetch, 'my-project', 'access-token')
    const { deadTokens } = await sender(['live', 'dead'], { title: 'T' })

    expect(deadTokens).toEqual(['dead'])
    expect(calls.length).toBe(2)
    expect(calls[0]?.url).toContain('/v1/projects/my-project/messages:send')
  })
})

describe('P9b send-push core — dispatchPush branching', () => {
  const rows: DeviceRow[] = [
    { token: 'e1', platform: 'ios', provider: 'expo' },
    { token: 'e2', platform: 'android', provider: 'expo' },
    { token: 'f1', platform: 'web', provider: 'fcm' },
  ]

  test('routes tokens to their provider sender and aggregates dead tokens', async () => {
    const seen: { expo?: string[]; fcm?: string[] } = {}
    const expo: ProviderSender = async (tokens) => {
      seen.expo = tokens
      return { deadTokens: ['e2'] }
    }
    const fcm: ProviderSender = async (tokens) => {
      seen.fcm = tokens
      return { deadTokens: [] }
    }

    const result = await dispatchPush(rows, { title: 'Hi' }, { expo, fcm })

    expect(seen.expo).toEqual(['e1', 'e2'])
    expect(seen.fcm).toEqual(['f1'])
    expect(result.deadTokens).toEqual(['e2'])
    expect(result.sent).toBe(2) // 3 tokens - 1 dead
  })

  test('skips a provider with no tokens', async () => {
    let fcmCalled = false
    const expo: ProviderSender = async () => ({ deadTokens: [] })
    const fcm: ProviderSender = async () => {
      fcmCalled = true
      return { deadTokens: [] }
    }
    await dispatchPush(
      [{ token: 'e1', platform: 'ios', provider: 'expo' }],
      {},
      { expo, fcm },
    )
    expect(fcmCalled).toBe(false)
  })
})
