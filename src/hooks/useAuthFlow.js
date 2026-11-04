import { useCallback } from 'react'
import {
  postJson,
  postForm,
  getJson,
  setToken,
  clearToken,
  setUser,
  clearUser,
  ApiError,
} from '../api/client'
import { cancelAllReminders } from '../utils/reminders'

// Shared auth actions used by both the website pages (LoginPage, RegisterPage,
// ForgotPasswordPage, UpdatePasswordPage) and the in-game auth screens
// (components/game-auth/*) - one place that talks to the backend, so the two
// surfaces can never drift into different validation/error/session
// behaviour. Every function here is a thin, page-agnostic wrapper; page-
// specific stuff (which screen to show next, redirect targets, banner copy)
// stays in the caller.
export function useAuthFlow() {
  // Shared tail of every sign-in path (password, Google, Apple): store the
  // token, load the full user record, cache it. Callers decide what happens
  // after (navigate, close an overlay, etc).
  const finishSignIn = useCallback(async (authResponse) => {
    setToken(authResponse.tokenId)
    const user = await getJson('/v1/user/find/logged-in')
    setUser(user)
    return user
  }, [])

  // AuthRequest only has a `mobileNumber` field, but the backend resolves it
  // against either the mobile number or the email
  // (findFirstByMobileNumberOrEmailAndStatus) - same single input field the
  // website's "Mobile Number or Email" box already uses.
  const signIn = useCallback(
    (mobileNumberOrEmail, password) =>
      postJson('/v1/authenticate', {
        mobileNumber: mobileNumberOrEmail,
        password,
      }),
    []
  )

  const signInWithGoogle = useCallback(
    (idToken) => postJson('/v1/auth/google', { idToken }),
    []
  )

  // `fullName` is only ever present on the athlete's very first Apple
  // authorization (Apple omits it on every later sign-in) - see
  // AppleSignInButton.jsx for where it's captured.
  const signInWithApple = useCallback(
    (identityToken, fullName) =>
      postJson('/v1/auth/apple', { identityToken, fullName }),
    []
  )

  // POST /v1/athlete/signup is multipart (see RegisterPage) and has no
  // password field at all - the backend emails a generated one, and the
  // athlete sets a real one afterward via completePasswordSetup. `values` is
  // a flat {fieldName: string} map; empty strings are dropped so optional
  // fields (occupation, blood group) aren't sent as empty parts.
  const signUpAthlete = useCallback((values) => {
    const formData = new FormData()
    Object.entries(values).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        formData.append(key, value)
      }
    })
    return postForm('/v1/athlete/signup', formData)
  }, [])

  const forgotPassword = useCallback(
    (mobileNumberOrEmail) =>
      postJson('/v1/user/forgot-password', {
        mobileNumber: mobileNumberOrEmail,
        passwordRequestType: 'EMAIL',
      }),
    []
  )

  // Mirrors UpdatePasswordPage: there's no dedicated "set password" endpoint
  // - the athlete authenticates once with the emailed password (to prove
  // they received it) and immediately changes it. The short-lived token from
  // that authenticate call is dropped either way, so they sign in fresh with
  // the new password right after (never left silently logged in on a
  // password they didn't choose).
  const completePasswordSetup = useCallback(
    async ({ mobileNumber, oldPassword, newPassword }) => {
      const auth = await postJson('/v1/authenticate', {
        mobileNumber,
        password: oldPassword,
      })
      setToken(auth.tokenId)
      try {
        await postJson('/v1/user/change-password', {
          oldPassword,
          newPassword,
        })
      } finally {
        clearToken()
      }
    },
    []
  )

  const signOut = useCallback(() => {
    clearToken()
    clearUser()
    // No-op on the website (see isNative/remindersSupported) - stops the
    // native app's daily "let's run" notifications from outliving the
    // session they were scheduled for.
    cancelAllReminders()
  }, [])

  return {
    signIn,
    signInWithGoogle,
    signInWithApple,
    signUpAthlete,
    forgotPassword,
    completePasswordSetup,
    finishSignIn,
    signOut,
  }
}

// Same error -> message mapping every page already did inline, pulled out
// so the game screens don't re-invent it. The backend already returns
// human-readable text (ApiError.message); this only supplies the fallback
// for a non-ApiError (e.g. a thrown TypeError) and labels the network-
// failure case (status 0, see api/client.js's fetchWithFallback) distinctly
// since "the server said no" and "we couldn't reach the server at all" read
// very differently to an athlete mid-run.
export function authErrorMessage(err, fallback) {
  if (err instanceof ApiError) {
    if (err.status === 0)
      return 'Could not reach the server. Check your connection and try again.'
    return err.message
  }
  return fallback
}
