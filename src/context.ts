import * as React from 'react'

import type { AnySupabaseClient, KVStorage } from './types'

/**
 * The context value: the single Supabase client plus an optional key-value
 * store. The client is loosely typed here (React context can't be generic);
 * the typed factory (`createSupabaseQuery`) re-types it per hook call.
 */
export type SupabaseContextValue = {
  supabase: AnySupabaseClient
  kvStorage?: KVStorage
}

export const SupabaseContext = React.createContext<SupabaseContextValue | null>(null)
