import type {
  MfaChallengeAndVerifyVariables,
  MfaChallengeVariables,
  MfaEnrollVariables,
  MfaUnenrollVariables,
  MfaVerifyVariables,
} from './types'
import { Keys } from '../query/Keys'
import type { QueryOptions, SupabaseException } from '../types'
import { useMutation } from '../useMutation'
import { useQuery } from '../useQuery'
import { useQueryClient } from '../useQueryClient'
import { useSupabase } from '../useSupabase'

/**
 * Multi-factor authentication, wrapping the `auth.mfa.*` API in one hook.
 *
 * Returns:
 * - `factors` — a query of the user's enrolled factors (`listFactors`).
 * - `enroll` — start enrollment; for TOTP the result carries the QR/secret to
 *   display (`data.totp.qr_code`).
 * - `challenge` — create a challenge for a factor.
 * - `verify` — verify a challenge with the user's code (completes enrollment /
 *   steps up the session's assurance level).
 * - `challengeAndVerify` — convenience combining the previous two.
 * - `unenroll` — remove a factor.
 *
 * `enroll` and `unenroll` invalidate `factors` on success. Requires TOTP (or
 * phone) MFA enabled in the project's Auth settings (§8.9).
 *
 * @example
 * ```tsx
 * const { enroll, challengeAndVerify, factors } = useMfa()
 * const { data } = await enroll.mutateAsync({ factorType: 'totp' })
 * // show data.totp.qr_code, then:
 * challengeAndVerify.mutate({ factorId: data.id, code: '123456' })
 * ```
 */
export function useMfa(factorsOptions: QueryOptions = {}) {
  const { supabase } = useSupabase()
  const queryClient = useQueryClient()

  const invalidateFactors = () =>
    queryClient.invalidateQueries({ queryKey: Keys.auth().mfaFactors() })

  const factors = useQuery({
    queryKey: Keys.auth().mfaFactors(),
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
    retry: false,
    ...factorsOptions,
  })

  const enroll = useMutation<unknown, SupabaseException, MfaEnrollVariables>({
    mutationKey: Keys.auth().mfaAuthenticator().create(),
    mutationFn: async ({ factorType = 'totp', friendlyName, phone, issuer }) => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType,
        friendlyName,
        phone,
        issuer,
      } as Parameters<typeof supabase.auth.mfa.enroll>[0])
      if (error) throw error
      return data
    },
    onSuccess: () => void invalidateFactors(),
  })

  const challenge = useMutation<unknown, SupabaseException, MfaChallengeVariables>({
    mutationKey: Keys.auth().mfaChallenge().create(),
    mutationFn: async ({ factorId, channel }) => {
      const { data, error } = await supabase.auth.mfa.challenge({
        factorId,
        channel,
      } as Parameters<typeof supabase.auth.mfa.challenge>[0])
      if (error) throw error
      return data
    },
  })

  const verify = useMutation<unknown, SupabaseException, MfaVerifyVariables>({
    mutationKey: Keys.auth().mfaChallenge().update(),
    mutationFn: async ({ factorId, challengeId, code }) => {
      const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code })
      if (error) throw error
      return data
    },
    onSuccess: () => void invalidateFactors(),
  })

  const challengeAndVerify = useMutation<unknown, SupabaseException, MfaChallengeAndVerifyVariables>({
    mutationKey: [...Keys.auth().mfaChallenge().update(), 'combined'],
    mutationFn: async ({ factorId, code }) => {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
      return data
    },
    onSuccess: () => void invalidateFactors(),
  })

  const unenroll = useMutation<unknown, SupabaseException, MfaUnenrollVariables>({
    mutationKey: Keys.auth().mfaAuthenticator().delete(),
    mutationFn: async ({ factorId }) => {
      const { data, error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      return data
    },
    onSuccess: () => void invalidateFactors(),
  })

  return { factors, enroll, challenge, verify, challengeAndVerify, unenroll }
}
