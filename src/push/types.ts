import type { QueryOptions } from '../types'

// -----------------------------------------------------------------------------
// push/ is a LIBRARY-OWNED, fixed-shape module (same category as auth/, storage/
// and teams/, NOT the schema-generic db/). The library ships the device-tokens
// schema-of-record (`sql/push/0001_init.sql`) and therefore owns these types —
// they are hand-defined to match the shipped migration and work even before a
// consumer runs `supabase gen types` (migration plan §6.6 / §8.12). They are
// deliberately NOT derived from the consumer's generated `Database`.
// -----------------------------------------------------------------------------

/** The device platform a token belongs to (a `check` constraint in the migration). */
export type DevicePlatform = 'ios' | 'android' | 'web'

/**
 * The push provider the token was minted by (a `check` constraint):
 * - `expo` — an Expo push token (native iOS/Android via the Expo Push API).
 * - `fcm` — a Firebase Cloud Messaging token (web via FCM HTTP v1).
 */
export type PushProvider = 'expo' | 'fcm'

/** A device-token row (`public.device_tokens`). */
export type DeviceToken = {
  id: string
  user_id: string
  token: string
  platform: DevicePlatform
  provider: PushProvider
  created_at: string
}

/** The result of a device-token list read: the rows plus the `exact` total. */
export type DeviceTokensResult = {
  total: number
  tokens: DeviceToken[]
}

// --- Hook variable shapes ----------------------------------------------------

/** Variables for `useRegisterDevice`. The library sets `user_id` from the session. */
export type RegisterDeviceVariables = {
  token: string
  platform: DevicePlatform
  provider: PushProvider
}

/** Variables for `useUnregisterDevice`. */
export type UnregisterDeviceVariables = { token: string }

/**
 * Variables for `useSendPush` — the payload handed to the `send-push` Edge
 * Function. Sends are usually server-to-server; this is exposed for authorized
 * in-app sends.
 */
export type SendPushVariables = {
  /** The recipient user ids to fan the notification out to. */
  userIds: string[]
  title?: string
  body?: string
  /** Arbitrary data payload delivered alongside the notification. */
  data?: Record<string, unknown>
}

// --- Configuration (name-override escape hatch) ------------------------------

/**
 * Optional overrides for `makePushHooks`. Defaults are canonical
 * (`public.device_tokens`, `send-push` function) and cover ~all projects; the
 * override just prevents a hard wall (migration plan §8.8 pattern). Don't
 * over-invest.
 */
export type PushConfig = {
  schema?: string
  table?: string
  fn?: { send?: string }
}

/** A fully-resolved {@link PushConfig} — every name filled in. */
export type ResolvedPushConfig = {
  schema: string
  table: string
  fn: { send: string }
}

/** The canonical names (what the shipped `sql/push` migration creates). */
export const CANONICAL_PUSH_CONFIG: ResolvedPushConfig = {
  schema: 'public',
  table: 'device_tokens',
  fn: { send: 'send-push' },
}

/** Merges a partial {@link PushConfig} onto the canonical defaults. */
export function resolvePushConfig(config: PushConfig = {}): ResolvedPushConfig {
  return {
    schema: config.schema ?? CANONICAL_PUSH_CONFIG.schema,
    table: config.table ?? CANONICAL_PUSH_CONFIG.table,
    fn: { ...CANONICAL_PUSH_CONFIG.fn, ...config.fn },
  }
}

/** Shared read options for the push query hooks. */
export type PushQueryOptions = QueryOptions
