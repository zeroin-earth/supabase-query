import type { Provider } from '@supabase/supabase-js'

import type { OAuthLoginVariables } from './types'
import { Keys } from '../query/Keys'
import type { SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useSupabase } from '../useSupabase'

/** The result of {@link useOAuthLogin}: the provider and the authorize `url`. On
 * web the browser is redirected automatically; `url` is chiefly useful with
 * `skipBrowserRedirect` (e.g. opening it in a native in-app browser). */
export type OAuthLoginResult = { provider: Provider; url: string | null }

/**
 * Starts an OAuth sign-in with the given provider.
 *
 * The provider is a lowercase string (`'google'`, `'apple'`, …), not an enum.
 * `redirectTo` must be in the project's redirect allow-list (§8.9). On web the
 * browser navigates to the provider automatically; pass `skipBrowserRedirect`
 * to receive the `url` and drive the redirect yourself (native/deep-link flows).
 *
 * @example
 * ```tsx
 * const { mutate } = useOAuthLogin()
 * mutate({ provider: 'google', redirectTo: 'https://example.com/auth/callback' })
 * ```
 */
export function useOAuthLogin() {
  const { supabase } = useSupabase()

  return useMutation<OAuthLoginResult, SupabaseException, OAuthLoginVariables>({
    mutationKey: Keys.auth().oauth().create(),
    mutationFn: async ({ provider, redirectTo, scopes, queryParams, skipBrowserRedirect }) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, scopes, queryParams, skipBrowserRedirect },
      })
      if (error) throw error
      return data
    },
  })
}
