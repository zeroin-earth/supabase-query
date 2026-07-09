// send-push — pure, transport-agnostic core (migration plan §6.6).
//
// This module holds the provider branching + dead-token pruning logic and is
// deliberately free of Deno/jsr imports so it can be unit-tested from bun with
// mocked Expo/FCM transports (the P8/P9 pattern — the live edge runtime does not
// hot-serve functions, so the transport is never exercised live). `index.ts`
// wires the real `fetch`, the FCM service-account JWT, and the service-role
// Supabase client around it.

export type PushProvider = 'expo' | 'fcm'

/** A device row as read from `device_tokens`. */
export type DeviceRow = {
  token: string
  platform: string
  provider: PushProvider
}

/** The notification payload. */
export type PushMessage = {
  title?: string
  body?: string
  data?: Record<string, unknown>
}

/** A provider sender: takes the tokens for its provider, returns the dead ones. */
export type ProviderSender = (
  tokens: string[],
  message: PushMessage,
) => Promise<{ deadTokens: string[] }>

/** Minimal `fetch` shape the real senders depend on (injectable for tests). */
export type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send'
const EXPO_CHUNK = 100

/**
 * Splits `items` into chunks of at most `size`. Expo accepts ≤100 messages per
 * request; FCM v1 is one message per request.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Parses an Expo Push API response and returns the tokens Expo reports as
 * `DeviceNotRegistered` (aligned by index with the request `tokens`).
 */
export function parseExpoReceipts(tokens: string[], responseJson: unknown): string[] {
  const receipts = (responseJson as { data?: Array<{ status?: string; details?: { error?: string } }> })
    ?.data
  if (!Array.isArray(receipts)) return []
  const dead: string[] = []
  receipts.forEach((r, i) => {
    if (r?.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
      const t = tokens[i]
      if (t) dead.push(t)
    }
  })
  return dead
}

/** Builds an Expo sender bound to a concrete `fetch` (+ optional access token). */
export function makeExpoSender(fetchImpl: FetchLike, accessToken?: string): ProviderSender {
  return async (tokens, message) => {
    const dead: string[] = []
    for (const batch of chunk(tokens, EXPO_CHUNK)) {
      const messages = batch.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
      }))
      const res = await fetchImpl(EXPO_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
      })
      const json = await res.json()
      dead.push(...parseExpoReceipts(batch, json))
    }
    return { deadTokens: dead }
  }
}

/**
 * Determines whether an FCM v1 error response means the token is permanently
 * dead (`UNREGISTERED` / `NOT_FOUND` — a 404), vs. a transient failure.
 */
export function isFcmTokenDead(status: number, responseJson: unknown): boolean {
  if (status === 404) return true
  const code = (responseJson as { error?: { status?: string } })?.error?.status
  return code === 'UNREGISTERED' || code === 'NOT_FOUND'
}

/** Builds an FCM v1 sender bound to a concrete `fetch`, project id, + access token. */
export function makeFcmSender(
  fetchImpl: FetchLike,
  projectId: string,
  accessToken: string,
): ProviderSender {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  return async (tokens, message) => {
    const dead: string[] = []
    // FCM v1 sends one message per request (the batch endpoint is deprecated).
    for (const token of tokens) {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: normalizeFcmData(message.data),
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        if (isFcmTokenDead(res.status, json)) dead.push(token)
      }
    }
    return { deadTokens: dead }
  }
}

/** FCM v1 `data` values must be strings — stringify non-string values. */
function normalizeFcmData(data?: Record<string, unknown>): Record<string, string> | undefined {
  if (!data) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }
  return out
}

/**
 * Branches `rows` by provider, sends each batch through its provider sender, and
 * aggregates the result. `sent` is the number of tokens **not** reported dead.
 * The caller prunes `deadTokens` from `device_tokens`.
 */
export async function dispatchPush(
  rows: DeviceRow[],
  message: PushMessage,
  senders: { expo: ProviderSender; fcm: ProviderSender },
): Promise<{ sent: number; deadTokens: string[] }> {
  const expoTokens = rows.filter((r) => r.provider === 'expo').map((r) => r.token)
  const fcmTokens = rows.filter((r) => r.provider === 'fcm').map((r) => r.token)

  const dead: string[] = []
  if (expoTokens.length) {
    const { deadTokens } = await senders.expo(expoTokens, message)
    dead.push(...deadTokens)
  }
  if (fcmTokens.length) {
    const { deadTokens } = await senders.fcm(fcmTokens, message)
    dead.push(...deadTokens)
  }

  const total = expoTokens.length + fcmTokens.length
  return { sent: total - dead.length, deadTokens: dead }
}
