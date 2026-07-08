import { useContext } from 'react'

import { SupabaseContext } from './context'

/**
 * Returns the Supabase client (and optional `kvStorage`) from context.
 * Must be used within a `<SupabaseProvider>`. Throws if called outside it.
 */
export function useSupabase() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('Wrap your app in <SupabaseProvider>')
  return ctx
}
