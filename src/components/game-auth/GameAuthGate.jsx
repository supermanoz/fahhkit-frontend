import { useEffect, useReducer, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthFlow, authErrorMessage } from '../../hooks/useAuthFlow'
import { createAuthThrottle } from '../../utils/authThrottle'
import {
  SCREEN,
  initialGameAuthState,
  gameAuthReducer,
} from '../../utils/gameAuthState'
import GameWelcomeScreen from './GameWelcomeScreen'
import GameSignInScreen from './GameSignInScreen'
import GameSignUpScreen from './GameSignUpScreen'
import GameForgotPasswordScreen from './GameForgotPasswordScreen'
import GameSetPasswordScreen from './GameSetPasswordScreen'
import './GameAuth.css'

// The in-game auth screens - every screen component below is presentational
// only (local form state, no network calls); this component owns every
// useAuthFlow() call and dispatches into the pure state machine in
// utils/gameAuthState.js (unit-tested there), so there is exactly one place
// that decides what a sign-in/sign-up/forgot attempt actually does. Mirrors
// the website's LoginPage/RegisterPage/ForgotPasswordPage/UpdatePasswordPage
// behaviour exactly (same endpoints via useAuthFlow, same firstLogin/
// MODERATOR handling, same emailed-password model) rather than inventing a
// different one for the game.
//
// `onAuthenticated(user)` is called once a sign-in of any kind succeeds -
// GamePage passes its useCurrentUser().replaceUser, which updates the shared
// token/user cache and triggers GamePage's own re-render, at which point
// useCurrentUser's `isAuthed` flips true and this gate stops rendering.
// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export default function GameAuthGate({ onAuthenticated }) {
  const auth = useAuthFlow()
  const throttleRef = useRef(createAuthThrottle())
  const [state, dispatch] = useReducer(gameAuthReducer, initialGameAuthState)

  // Ticks both cooldown countdowns once a second while either is active -
  // both are cosmetic client-side throttles (see authThrottle.js), not a
  // real backend rate limit.
  useEffect(() => {
    if (state.cooldownSeconds <= 0 && state.resendCooldownSeconds <= 0) return
    const id = setInterval(() => dispatch({ type: 'TICK_COOLDOWNS' }), 1000)
    return () => clearInterval(id)
  }, [state.cooldownSeconds, state.resendCooldownSeconds])

  function goTo(screen) {
    dispatch({ type: 'GO_TO', screen })
  }

  // Shared tail of password/Google/Apple sign-in - same split the website's
  // LoginPage makes: a moderator on their very first login must set a real
  // password before anything else; every other first login (the normal
  // athlete case) just signs in straight away, even while still on the
  // emailed password.
  async function completeSignIn(data, mobileNumberForSetup) {
    if (data.firstLogin && data.userType === 'MODERATOR') {
      dispatch({
        type: 'SIGN_IN_NEEDS_PASSWORD_SETUP',
        mobileNumber: mobileNumberForSetup,
      })
      return
    }
    const user = await auth.finishSignIn(data)
    throttleRef.current.recordSuccess()
    dispatch({ type: 'AUTHENTICATED' })
    onAuthenticated(user)
  }

  async function handleSignIn(mobileNumber, password) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signIn(mobileNumber, password)
      await completeSignIn(data, mobileNumber)
    } catch (err) {
      throttleRef.current.recordFailure()
      const seconds = Math.ceil(
        throttleRef.current.cooldownRemainingMs() / 1000
      )
      if (seconds > 0) dispatch({ type: 'LOGIN_FAILURE_COOLDOWN', seconds })
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(err, 'Sign in failed. Please try again.'),
      })
    }
  }

  async function handleGoogleCredential(idToken) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signInWithGoogle(idToken)
      await completeSignIn(data)
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(
          err,
          'Google sign-in failed. Please try again.'
        ),
      })
    }
  }

  async function handleAppleCredential(identityToken, fullName) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signInWithApple(identityToken, fullName)
      await completeSignIn(data)
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(
          err,
          'Apple sign-in failed. Please try again.'
        ),
      })
    }
  }

  function handleOAuthError(provider) {
    dispatch({
      type: 'SUBMIT_ERROR',
      message: `${provider} sign-in was cancelled or failed.`,
    })
  }

  async function handleSignUp(formValues) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signUpAthlete(formValues)
      dispatch({
        type: 'SIGN_UP_SENT',
        email: data?.email || formValues.email,
        mobileNumber: formValues.mobileNumber,
      })
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(
          err,
          'Registration failed. Please try again.'
        ),
      })
    }
  }

  // "Resend" has no dedicated endpoint - the login details ARE an emailed
  // password, so re-sending them is exactly what forgot-password already
  // does. Reusing it here instead of inventing a fake resend call.
  async function handleResend() {
    if (state.resendCooldownSeconds > 0) return
    try {
      await auth.forgotPassword(state.pendingMobile)
      dispatch({ type: 'RESEND_STARTED' })
    } catch {
      // Silently ignored - the "sent" screen doesn't have its own banner
      // slot, and a failed resend isn't worth blocking on; the athlete can
      // always fall back to the full Forgot Password screen instead.
    }
  }

  async function handleForgot(mobileNumber) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      await auth.forgotPassword(mobileNumber)
      dispatch({ type: 'FORGOT_SENT', mobileNumber })
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(
          err,
          'Something went wrong. Please try again.'
        ),
      })
    }
  }

  async function handleSetPassword({ mobileNumber, oldPassword, newPassword }) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      await auth.completePasswordSetup({
        mobileNumber,
        oldPassword,
        newPassword,
      })
      dispatch({ type: 'SET_PASSWORD_DONE', mobileNumber })
    } catch (err) {
      dispatch({
        type: 'SUBMIT_ERROR',
        message: authErrorMessage(
          err,
          'Could not update password. Please try again.'
        ),
      })
    }
  }

  const {
    screen,
    banner,
    submitting,
    cooldownSeconds,
    resendCooldownSeconds,
    signUpSentEmail,
    forgotSent,
    pendingMobile,
  } = state

  const screens = {
    [SCREEN.WELCOME]: (
      <GameWelcomeScreen
        banner={banner}
        onSignIn={() => goTo(SCREEN.SIGN_IN)}
        onSignUp={() => goTo(SCREEN.SIGN_UP)}
        onGoogleCredential={handleGoogleCredential}
        onAppleCredential={handleAppleCredential}
        onOAuthError={handleOAuthError}
      />
    ),
    [SCREEN.SIGN_IN]: (
      <GameSignInScreen
        banner={banner}
        submitting={submitting}
        cooldownSeconds={cooldownSeconds}
        initialMobileNumber={pendingMobile}
        onSubmit={handleSignIn}
        onForgot={() => goTo(SCREEN.FORGOT)}
        onBack={() => goTo(SCREEN.WELCOME)}
      />
    ),
    [SCREEN.SIGN_UP]: (
      <GameSignUpScreen
        banner={banner}
        submitting={submitting}
        sentEmail={signUpSentEmail}
        resendCooldownSeconds={resendCooldownSeconds}
        onSubmit={handleSignUp}
        onResend={handleResend}
        onBack={() => {
          dispatch({ type: 'RESET_SIGN_UP_SENT' })
          goTo(SCREEN.WELCOME)
        }}
        onHavePassword={() => goTo(SCREEN.SET_PASSWORD)}
      />
    ),
    [SCREEN.FORGOT]: (
      <GameForgotPasswordScreen
        banner={banner}
        submitting={submitting}
        sent={forgotSent}
        onSubmit={handleForgot}
        onBack={() => {
          dispatch({ type: 'RESET_FORGOT_SENT' })
          goTo(SCREEN.SIGN_IN)
        }}
        onHavePassword={() => goTo(SCREEN.SET_PASSWORD)}
      />
    ),
    [SCREEN.SET_PASSWORD]: (
      <GameSetPasswordScreen
        banner={banner}
        submitting={submitting}
        initialMobileNumber={pendingMobile}
        onSubmit={handleSetPassword}
        onBack={() => goTo(SCREEN.SIGN_IN)}
      />
    ),
  }

  return (
    <div className="game-auth-gate">
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className="game-auth-screen"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.18 }}
        >
          {screens[screen]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
