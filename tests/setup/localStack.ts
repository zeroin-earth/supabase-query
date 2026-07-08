import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Connection details for the local `supabase start` stack (migration plan §8.2).
 * These are the deterministic local-dev demo keys printed by `supabase status`;
 * they are not secrets and are safe to commit for the integration suite.
 */
export const LOCAL_URL = 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/** Service-role client — bypasses RLS; used only for test setup/teardown. */
export function makeAdminClient(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type AuthedUser = {
  supabase: SupabaseClient
  uid: string
  cleanup: () => Promise<void>
}

/**
 * Creates a confirmed auth user via the admin API and returns an anon client
 * signed in as that user, so RLS policies (`auth.uid() = user_id`) are exercised
 * exactly as a real app would. `cleanup()` deletes the user (cascading its rows).
 */
export async function createAuthedUser(): Promise<AuthedUser> {
  const admin = makeAdminClient()
  const email = `p4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'password123'

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr) throw createErr
  const uid = created.user!.id

  // Under the happy-dom test preload the global `WebSocket` is a non-functional
  // stub; inject Bun's native one (captured in preload) so realtime can connect.
  const nativeWebSocket = (
    globalThis as unknown as { __NATIVE_WEBSOCKET__?: typeof WebSocket }
  ).__NATIVE_WEBSOCKET__
  const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: { eventsPerSecond: 10 },
      ...(nativeWebSocket ? { transport: nativeWebSocket as never } : {}),
    },
  })
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) throw signInErr

  return {
    supabase,
    uid,
    cleanup: async () => {
      await supabase.removeAllChannels()
      await supabase.auth.signOut()
      await admin.auth.admin.deleteUser(uid)
    },
  }
}
