import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

import type { AnyDatabase, KVStorage } from './types'

/**
 * Creates the single Supabase client the hooks run on.
 *
 * Unlike Appwrite (many service objects), Supabase is one client exposing
 * `.from`, `.auth`, `.storage`, `.realtime`, `.functions`, and `.rpc`. The
 * client is generic over the consumer's generated `Database` type; the typed
 * factory (`createSupabaseQuery`) supplies a real schema so table names and
 * row types infer. The library ships no schema of its own.
 *
 * @example
 * ```ts
 * const { supabase } = createSupabaseClient<Database>({
 *   url: process.env.SUPABASE_URL!,
 *   anonKey: process.env.SUPABASE_ANON_KEY!,
 * })
 * ```
 *
 * For advanced configuration, build your own client with `createClient` and
 * pass it to `<SupabaseProvider client={{ supabase }}>` instead.
 */
export function createSupabaseClient<Database = AnyDatabase>({
  url,
  anonKey,
  authStorage,
  isNative = false,
}: {
  url: string
  anonKey: string
  /**
   * React Native: pass `AsyncStorage` so GoTrue persists the auth session
   * natively. Omit on web to use `localStorage`. This is separate from the
   * offline query-cache persister — the two solve different problems.
   */
  authStorage?: KVStorage
  /** Set `true` on React Native to disable URL-based session detection. */
  isNative?: boolean
}) {
  const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: !isNative,
    },
  })

  return { supabase }
}

/** The client bundle held in context. Generic over the consumer's `Database`. */
export type SupabaseHooksClient<Database = AnyDatabase> = {
  supabase: SupabaseClient<Database>
}
