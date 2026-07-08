// The `auth/` module: GoTrue-backed hooks (was Appwrite `account/`), consolidated
// per migration plan §7. Also available fully wired via the `createSupabaseQuery`
// factory (`makeAuthHooks`).

export { getSessionQuery, getUserQuery } from './queryOptions'
export { useUser, useSuspenseUser } from './useUser'
export { useSession } from './useSession'
export { useSignUp, type SignUpResult } from './useSignUp'
export { useLogin } from './useLogin'
export { useLogout } from './useLogout'
export { useOAuthLogin, type OAuthLoginResult } from './useOAuth'
export { useMagicLink } from './useMagicLink'
export { useEmailOtp } from './useEmailOtp'
export { usePhoneOtp } from './usePhoneOtp'
export { useAnonymousLogin } from './useAnonymousLogin'
export { useUpdateUser } from './useUpdateUser'
export { usePasswordRecovery } from './usePasswordRecovery'
export { useResetPassword } from './useResetPassword'
export { useVerification } from './useVerification'
export { useMfa } from './useMfa'
export { useIdentities } from './useIdentities'
export type {
  AnonymousLoginVariables,
  EmailOtpType,
  LinkIdentityVariables,
  LoginVariables,
  LogoutVariables,
  MagicLinkVariables,
  MfaChallengeAndVerifyVariables,
  MfaChallengeVariables,
  MfaEnrollVariables,
  MfaUnenrollVariables,
  MfaVerifyVariables,
  MobileOtpType,
  OAuthLoginVariables,
  PasswordRecoveryVariables,
  Provider,
  ResendVariables,
  ResetPasswordVariables,
  SendEmailOtpVariables,
  SendPhoneOtpVariables,
  Session,
  SignUpVariables,
  UpdateUserVariables,
  User,
  VerificationVariables,
  VerifyEmailOtpVariables,
  VerifyPhoneOtpVariables,
} from './types'
