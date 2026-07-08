// Platform-neutral exports shared by both the web (`src/index.ts`) and React
// Native (`src/native-entry.ts`) entries. Populated across phases P1–P9.

export const version = '0.1.0'

// P1 — client, context, and accessor
export { createSupabaseClient } from './client'
export type { SupabaseHooksClient } from './client'
export { SupabaseContext } from './context'
export type { SupabaseContextValue } from './context'
export { useSupabase } from './useSupabase'
export type {
  AnyDatabase,
  AnySupabaseClient,
  KVStorage,
  Prettify,
  QueryOptions,
  Session,
  SupabaseClient,
  SupabaseException,
  User,
} from './types'

// P2 — TanStack wrappers, auth-state key, and the shared provider props type.
// The platform-bound provider + `createSupabaseQuery` factory are exported from
// the web (`index.ts`) and native (`native-entry.ts`) entries.
export { AUTH_USER_QUERY_KEY } from './authState'
export type { SupabaseProviderProps } from './SupabaseProvider'
export { useLazyQuery } from './useLazyQuery'
export { useMutation } from './useMutation'
export { useQuery } from './useQuery'
export { useQueryClient } from './useQueryClient'
export { useSuspenseQuery } from './useSuspenseQuery'

// P3 — query-key factory, PostgREST query builder, and realtime helper
export { subscribeToTable } from './db/realtime'
export type { PostgresChangePayload, SubscribeOptions } from './db/realtime'
export { Keys } from './query/Keys'
export { q, QueryBuilder } from './query/QueryBuilder'
export type { GeoOp, PostgrestOp, QueryOp } from './query/QueryBuilder'

// P4 — the `db/` module: schema-generic row/table hooks (also available fully
// typed via the `createSupabaseQuery` factory), query-option builders, the
// standalone mutation fns (for the P5 offline registry), and their types.
export { getRowQuery, getRowsQuery } from './db/queryOptions'
export type { RowQueryParams, RowsQueryParams } from './db/queryOptions'
export { useRow, useSuspenseRow } from './db/useRow'
export { useRows, useSuspenseRows } from './db/useRows'
export { useInfiniteRows } from './db/useInfiniteRows'
export {
  useRowsWithPagination,
  useSuspenseRowsWithPagination,
} from './db/useRowsWithPagination'
export { createRowFn, useCreateRow } from './db/useCreateRow'
export { updateRowFn, useUpdateRow } from './db/useUpdateRow'
export { upsertRowFn, useUpsertRow } from './db/useUpsertRow'
export { deleteRowFn, useDeleteRow } from './db/useDeleteRow'
export { incrementColumnFn, useAdjustColumn, useIncrementColumn } from './db/useIncrementColumn'
export { useDecrementColumn } from './db/useDecrementColumn'
export type {
  BuilderFn,
  CreateRowVariables,
  DeleteRowVariables,
  IncrementColumnVariables,
  ReadOptions,
  Row,
  RowMutationContext,
  RowsResult,
  UpdateRowVariables,
  UpsertRowVariables,
} from './db/types'

// P6 — the `auth/` module: GoTrue-backed hooks (also available fully wired via
// the `createSupabaseQuery` factory), plus query-option builders and variable types.
export { getSessionQuery, getUserQuery } from './auth/queryOptions'
export { useSuspenseUser, useUser } from './auth/useUser'
export { useSession } from './auth/useSession'
export { useSignUp } from './auth/useSignUp'
export type { SignUpResult } from './auth/useSignUp'
export { useLogin } from './auth/useLogin'
export { useLogout } from './auth/useLogout'
export { useOAuthLogin } from './auth/useOAuth'
export type { OAuthLoginResult } from './auth/useOAuth'
export { useMagicLink } from './auth/useMagicLink'
export { useEmailOtp } from './auth/useEmailOtp'
export { usePhoneOtp } from './auth/usePhoneOtp'
export { useAnonymousLogin } from './auth/useAnonymousLogin'
export { useUpdateUser } from './auth/useUpdateUser'
export { usePasswordRecovery } from './auth/usePasswordRecovery'
export { useResetPassword } from './auth/useResetPassword'
export { useVerification } from './auth/useVerification'
export { useMfa } from './auth/useMfa'
export { useIdentities } from './auth/useIdentities'
export type {
  AnonymousLoginVariables,
  LinkIdentityVariables,
  LoginVariables,
  LogoutVariables,
  MagicLinkVariables,
  MfaChallengeAndVerifyVariables,
  MfaChallengeVariables,
  MfaEnrollVariables,
  MfaUnenrollVariables,
  MfaVerifyVariables,
  OAuthLoginVariables,
  PasswordRecoveryVariables,
  ResendVariables,
  ResetPasswordVariables,
  SendEmailOtpVariables,
  SendPhoneOtpVariables,
  SignUpVariables,
  UpdateUserVariables,
  VerificationVariables,
  VerifyEmailOtpVariables,
  VerifyPhoneOtpVariables,
} from './auth/types'

// P5 — offline engine: offline-capable client factory, conflict resolution, the
// replay registry, and network adapter type. The concrete web/native network
// adapters are exported per-platform from `index.ts` / `native-entry.ts`.
export { createOfflineClient } from './offline/createOfflineClient'
export type { OfflineClient } from './offline/createOfflineClient'
export { resolveConflict } from './offline/conflictResolution/resolve'
export type {
  ConflictContext,
  ConflictDocument,
  ConflictStrategy,
} from './offline/conflictResolution/types'
export { conflictAwareUpdate } from './offline/mutations/conflictAwareUpdate'
export { hydrateMutationDefaults, mutationRegistry } from './offline/mutations/registry'
export type { MutationFn, NetworkAdapter, Vars } from './offline/types'
export type { AsyncStorage, Persister } from '@tanstack/query-persist-client-core'
