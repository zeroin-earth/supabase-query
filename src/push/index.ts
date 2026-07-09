// The `push/` module: a LIBRARY-OWNED, fixed-shape module (migration plan §6.6
// / §8.12) that replaces Appwrite Messaging + push targets. The library ships
// the device-tokens schema-of-record (`sql/push/0001_init.sql`, via
// `npx @zeroin.earth/supabase-query add push`) and owns the `DeviceToken` type —
// it is NOT parameterized by the consumer's generated `Database`. Fully wired
// via `createSupabaseQuery`'s `makePushHooks`.
//
// Two halves: client-side token registration (these hooks) + a server-side
// sender (the `send-push` Edge Function, which holds the provider secrets).

export { getDeviceTokensQuery } from './queryOptions'
export { useDeviceTokens } from './useDeviceTokens'
export { useRegisterDevice } from './useRegisterDevice'
export { useUnregisterDevice } from './useUnregisterDevice'
export { useSendPush } from './useSendPush'
export type { SendPushResult } from './useSendPush'
export { makePushHooks } from './factory'
export { CANONICAL_PUSH_CONFIG, resolvePushConfig } from './types'
export type {
  DevicePlatform,
  DeviceToken,
  DeviceTokensResult,
  PushConfig,
  PushProvider,
  PushQueryOptions,
  RegisterDeviceVariables,
  ResolvedPushConfig,
  SendPushVariables,
  UnregisterDeviceVariables,
} from './types'
