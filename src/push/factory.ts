import type {
  PushConfig,
  PushQueryOptions,
  RegisterDeviceVariables,
  SendPushVariables,
  UnregisterDeviceVariables,
} from './types'
import { resolvePushConfig } from './types'
import { useDeviceTokens as useDeviceTokensBase } from './useDeviceTokens'
import { useRegisterDevice as useRegisterDeviceBase } from './useRegisterDevice'
import { useSendPush as useSendPushBase } from './useSendPush'
import { useUnregisterDevice as useUnregisterDeviceBase } from './useUnregisterDevice'

/**
 * Builds the push hook set returned by `createSupabaseQuery`.
 *
 * Push is a **library-owned fixed-shape module** (like `makeAuthHooks`/
 * `makeStorageHooks`/`makeTeamsHooks`, NOT the schema-generic `makeDbHooks`):
 * its `DeviceToken` type is hand-defined to match the shipped
 * `sql/push/0001_init.sql` migration, so the hooks work even before the consumer
 * runs `supabase gen types`.
 *
 * `config` is the optional name-override escape hatch (table / function name);
 * it defaults to canonical (`device_tokens`, `send-push`). Don't over-invest —
 * canonical covers ~all projects (migration plan §8.8 pattern).
 *
 * @internal
 */
export function makePushHooks(config: PushConfig = {}) {
  const c = resolvePushConfig(config)

  return {
    useDeviceTokens: (opts?: PushQueryOptions) => useDeviceTokensBase(opts, c),
    useRegisterDevice: () => useRegisterDeviceBase(c),
    useUnregisterDevice: () => useUnregisterDeviceBase(c),
    useSendPush: () => useSendPushBase(c),
  }
}

// Re-export the variable types so a consumer can annotate call-sites even when
// they only import the factory's returned hooks. (Type-only; erased at build.)
export type { RegisterDeviceVariables, SendPushVariables, UnregisterDeviceVariables }
