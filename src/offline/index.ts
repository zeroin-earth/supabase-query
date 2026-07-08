export { createOfflineClient } from './createOfflineClient'
export type { OfflineClient } from './createOfflineClient'
export { resolveConflict } from './conflictResolution/resolve'
export type {
  ConflictContext,
  ConflictDocument,
  ConflictStrategy,
} from './conflictResolution/types'
export { conflictAwareUpdate } from './mutations/conflictAwareUpdate'
export { hydrateMutationDefaults, mutationRegistry } from './mutations/registry'
export type { MutationFn, NetworkAdapter, Vars } from './types'
export type { AsyncStorage, Persister } from '@tanstack/query-persist-client-core'
