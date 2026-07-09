import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

import { makeAuthHooks } from './auth/factory'
import { makeDbHooks } from './db/factory'
import { makeFunctionHooks } from './functions/factory'
import { makePushHooks } from './push/factory'
import { makeStorageHooks } from './storage/factory'
import type { SupabaseProviderProps } from './SupabaseProvider'
import { makeTeamsHooks } from './teams/factory'
import type { AnyDatabase, KVStorage } from './types'
import { useLazyQuery } from './useLazyQuery'
import { useMutation } from './useMutation'
import { useQuery } from './useQuery'
import { useQueryClient } from './useQueryClient'
import { useSupabase as useSupabaseBase } from './useSupabase'
import { useSuspenseQuery } from './useSuspenseQuery'

/**
 * Builds a platform-bound `createSupabaseQuery` factory. The web and React
 * Native entries call this with their respective provider, so consumers get the
 * correct provider (devtools on web, none on native) from a single import.
 * @internal
 */
export function makeCreateSupabaseQuery(SupabaseProvider: ComponentType<SupabaseProviderProps>) {
  /**
   * Call this **once** per app with your generated `Database` type to receive a
   * fully-typed set of hooks plus the provider:
   *
   * ```ts
   * export const { SupabaseProvider, useRow, useRows } =
   *   createSupabaseQuery<Database>()
   * ```
   *
   * The `Database` type parameter binds through the returned hooks so their
   * table names and row types infer from your schema. Today it types the
   * context client (`useSupabase`) and returns the backend-agnostic TanStack
   * wrappers; the typed `db/`, `auth/`, `storage/`, … hooks are populated in P4+.
   */
  return function createSupabaseQuery<Database = AnyDatabase>() {
    /** The context client, typed to the consumer's generated `Database`. */
    const useSupabase = () =>
      useSupabaseBase() as { supabase: SupabaseClient<Database>; kvStorage?: KVStorage }

    return {
      SupabaseProvider,
      useSupabase,
      useQuery,
      useMutation,
      useSuspenseQuery,
      useLazyQuery,
      useQueryClient,
      // P4 — the schema-typed `db/` hook set (row/table CRUD, realtime, RPC).
      ...makeDbHooks<Database>(),
      // P6 — the `auth/` hook set (GoTrue: user/session, login/signup/logout,
      // OAuth, OTP, MFA, identities). Not `Database`-parameterized.
      ...makeAuthHooks(),
      // P7 — the `storage/` hook set (list/info, upload/update/delete/download,
      // public + signed URLs). Not `Database`-parameterized.
      ...makeStorageHooks(),
      // P8 — the `functions/` hook set: Edge Function invoke + schema-typed
      // Postgres RPC (read via `useRpc`, mutate via `useCallRpc`).
      ...makeFunctionHooks<Database>(),
      // P9 — the `teams/` hook set: library-owned fixed-shape teams module
      // (schema-of-record shipped in `sql/teams`). Not `Database`-parameterized;
      // for typed roles or custom names call `makeTeamsHooks<Role>(config)`.
      ...makeTeamsHooks(),
      // P9b — the `push/` hook set: library-owned fixed-shape push module
      // (device_tokens schema shipped in `sql/push`; `send-push` Edge Function).
      // Not `Database`-parameterized.
      ...makePushHooks(),
    }
  }
}
