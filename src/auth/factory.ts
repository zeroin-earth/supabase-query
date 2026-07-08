import { useAnonymousLogin } from './useAnonymousLogin'
import { useEmailOtp } from './useEmailOtp'
import { useIdentities } from './useIdentities'
import { useLogin } from './useLogin'
import { useLogout } from './useLogout'
import { useMagicLink } from './useMagicLink'
import { useMfa } from './useMfa'
import { useOAuthLogin } from './useOAuth'
import { usePasswordRecovery } from './usePasswordRecovery'
import { usePhoneOtp } from './usePhoneOtp'
import { useResetPassword } from './useResetPassword'
import { useSession } from './useSession'
import { useSignUp } from './useSignUp'
import { useUpdateUser } from './useUpdateUser'
import { useSuspenseUser, useUser } from './useUser'
import { useVerification } from './useVerification'

/**
 * The `auth/` hook set returned by `createSupabaseQuery`.
 *
 * Unlike the `db/` hooks, auth hooks aren't parameterized by the consumer's
 * `Database` — GoTrue's `User`/`Session` shapes are fixed — so this factory just
 * bundles the hooks (kept symmetric with `makeDbHooks` so both spread into the
 * factory the same way).
 * @internal
 */
export function makeAuthHooks() {
  return {
    useUser,
    useSuspenseUser,
    useSession,
    useSignUp,
    useLogin,
    useLogout,
    useOAuthLogin,
    useMagicLink,
    useEmailOtp,
    usePhoneOtp,
    useAnonymousLogin,
    useUpdateUser,
    usePasswordRecovery,
    useResetPassword,
    useVerification,
    useMfa,
    useIdentities,
  }
}
