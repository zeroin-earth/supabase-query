import type { EmailOtpType, MobileOtpType, Provider, Session, User } from '@supabase/supabase-js'

export type { EmailOtpType, MobileOtpType, Provider, Session, User }

/** Variables for {@link useSignUp}. */
export type SignUpVariables = {
  email: string
  password: string
  /** Extra fields stored on the user's `user_metadata` (GoTrue `options.data`). */
  data?: Record<string, unknown>
  /** URL the confirmation email links back to (must be in the redirect allow-list, §8.9). */
  emailRedirectTo?: string
}

/** Variables for {@link useLogin}. */
export type LoginVariables = { email: string; password: string }

/** Variables for {@link useOAuthLogin}. */
export type OAuthLoginVariables = {
  /** Lowercase provider id, e.g. `'google'`, `'apple'` (not an enum). */
  provider: Provider
  /** Where GoTrue returns the user after the provider callback (allow-list, §8.9). */
  redirectTo?: string
  scopes?: string
  queryParams?: Record<string, string>
  /** Return the authorize URL instead of navigating the browser (native/deep-link flows). */
  skipBrowserRedirect?: boolean
}

/** Variables for {@link useLogout}. */
export type LogoutVariables =
  | {
      /**
       * `'global'` (default) revokes every session, `'local'` only this device,
       * `'others'` all sessions except the current one.
       */
      scope?: 'global' | 'local' | 'others'
    }
  | void

/** Variables for {@link useAnonymousLogin}. */
export type AnonymousLoginVariables =
  | {
      /** Extra fields stored on `user_metadata`. */
      data?: Record<string, unknown>
    }
  | void

/** Variables for {@link useMagicLink}. */
export type MagicLinkVariables = {
  email: string
  emailRedirectTo?: string
  /** Create the user if they don't exist yet (GoTrue default `true`). */
  shouldCreateUser?: boolean
}

/** Variables to send an email OTP ({@link useEmailOtp} `send`). */
export type SendEmailOtpVariables = { email: string; shouldCreateUser?: boolean; emailRedirectTo?: string }
/** Variables to verify an email OTP ({@link useEmailOtp} `verify`). */
export type VerifyEmailOtpVariables = { email: string; token: string; type?: EmailOtpType }

/** Variables to send a phone OTP ({@link usePhoneOtp} `send`). */
export type SendPhoneOtpVariables = { phone: string; shouldCreateUser?: boolean }
/** Variables to verify a phone OTP ({@link usePhoneOtp} `verify`). */
export type VerifyPhoneOtpVariables = { phone: string; token: string; type?: MobileOtpType }

/** Variables for {@link useUpdateUser} — any subset may be supplied. */
export type UpdateUserVariables = {
  email?: string
  phone?: string
  password?: string
  /** Merged into `user_metadata`. */
  data?: Record<string, unknown>
}

/** Variables for {@link usePasswordRecovery}. */
export type PasswordRecoveryVariables = { email: string; redirectTo?: string }
/** Variables for {@link useResetPassword} — run inside the recovery session from the email link. */
export type ResetPasswordVariables = { password: string }

/** Variables for {@link useVerification} `verify` — either an OTP code or a link `tokenHash`. */
export type VerificationVariables =
  | { type: EmailOtpType; email: string; token: string }
  | { type: EmailOtpType; tokenHash: string }

/** Variables for {@link useVerification} `resend`. */
export type ResendVariables =
  | { type: 'signup' | 'email_change'; email: string; emailRedirectTo?: string }
  | { type: 'sms' | 'phone_change'; phone: string }

/** Variables for {@link useMfa} `enroll`. */
export type MfaEnrollVariables = {
  factorType?: 'totp' | 'phone'
  friendlyName?: string
  /** Required when `factorType: 'phone'`. */
  phone?: string
  issuer?: string
}
/** Variables for {@link useMfa} `challenge`. */
export type MfaChallengeVariables = { factorId: string; channel?: 'sms' | 'whatsapp' }
/** Variables for {@link useMfa} `verify`. */
export type MfaVerifyVariables = { factorId: string; challengeId: string; code: string }
/** Variables for {@link useMfa} `challengeAndVerify`. */
export type MfaChallengeAndVerifyVariables = { factorId: string; code: string }
/** Variables for {@link useMfa} `unenroll`. */
export type MfaUnenrollVariables = { factorId: string }

/** Variables for {@link useIdentities} `linkIdentity`. */
export type LinkIdentityVariables = {
  provider: Provider
  redirectTo?: string
  scopes?: string
}
