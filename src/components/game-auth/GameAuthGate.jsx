import { useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthFlow } from '../../hooks/useAuthFlow'
import {
  AUTH_FLOW,
  MESSAGES,
  describeAuthError,
  logAuthError,
} from '../../utils/authErrors'
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
// Where the hardware Back button goes from each screen (see
// onBackStateChange below) - mirrors each screen's own "Back"
// link/onBack prop exactly, so there's one answer either way.
const BACK_TARGET = {
  [SCREEN.SIGN_IN]: SCREEN.WELCOME,
  [SCREEN.SIGN_UP]: SCREEN.WELCOME,
  [SCREEN.FORGOT]: SCREEN.SIGN_IN,
  [SCREEN.SET_PASSWORD]: SCREEN.SIGN_IN,
}

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
export default function GameAuthGate({ onAuthenticated, onBackStateChange }) {
  const auth = useAuthFlow()
  const throttleRef = useRef(createAuthThrottle())
  const [state, dispatch] = useReducer(gameAuthReducer, initialGameAuthState)

  // Reports "how to go back one step from here" up to GamePage's hardware
  // Back button handler (null at WELCOME - nothing to go back to, so Back
  // falls through to the usual exit-confirm there instead). A ref, not
  // state, on GamePage's side - see useAndroidBackButton.
  useEffect(() => {
    const target = BACK_TARGET[state.screen]
    onBackStateChange?.(
      target ? () => dispatch({ type: 'GO_TO', screen: target }) : null
    )
    // Only GamePage needs the latest closure; it isn't meant to trigger
    // this effect on its own identity changing between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen])

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

  // The player edited a field (or retried): the notice has done its job.
  function clearBanner() {
    dispatch({ type: 'CLEAR_BANNER' })
  }

  // One place turns any failure into what the player sees: logged for
  // developers (console only), mapped to a friendly line by
  // utils/authErrors.js - never a code, a plugin message or server text.
  // A cancelled Google/Apple sheet shows nothing.
  function fail(flow, err) {
    logAuthError(flow, err)
    const info = describeAuthError(err, { flow })
    if (info.silent) {
      dispatch({ type: 'SUBMIT_CANCELLED' })
      return
    }
    dispatch({ type: 'SUBMIT_ERROR', kind: info.kind, message: info.message })
    return info
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
      fail(AUTH_FLOW.SIGN_IN, err)
    }
  }

  async function handleGoogleCredential(idToken) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signInWithGoogle(idToken)
      await completeSignIn(data)
    } catch (err) {
      fail(AUTH_FLOW.GOOGLE, err)
    }
  }

  async function handleAppleCredential(identityToken, fullName, extra) {
    dispatch({ type: 'SUBMIT_START' })
    try {
      const data = await auth.signInWithApple(identityToken, fullName, extra)
      await completeSignIn(data)
    } catch (err) {
      fail(AUTH_FLOW.APPLE, err)
    }
  }

  // The Google/Apple buttons already mapped their own failure (and stay
  // silent on a cancel); `message` is the friendly line, `info.kind` its
  // tone. Without one, the generic "isn't working right now" line.
  function handleOAuthError(provider, message, info) {
    dispatch({
      type: 'SUBMIT_ERROR',
      kind: info?.kind || 'warning',
      message: message || MESSAGES.provider(provider),
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
      fail(AUTH_FLOW.SIGN_UP, err)
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
      fail(AUTH_FLOW.FORGOT, err)
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
      fail(AUTH_FLOW.SET_PASSWORD, err)
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
    passwordUpdated,
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
        onEdit={clearBanner}
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
        onEdit={clearBanner}
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
        onEdit={clearBanner}
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
        passwordUpdated={passwordUpdated}
        onEdit={clearBanner}
        onSignIn={() => goTo(SCREEN.SIGN_IN)}
        onSubmit={handleSetPassword}
        onBack={() => goTo(SCREEN.SIGN_IN)}
      />
    ),
  }

  // On-screen keyboard: size the gate to the VISIBLE viewport so it simply
  // scrolls (nothing hides behind the keyboard), and bring the focused field
  // into view once the keyboard has finished opening.
  const [viewportH, setViewportH] = useState(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return undefined
    const sync = () => setViewportH(Math.round(vv.height))
    sync()
    vv.addEventListener('resize', sync)
    return () => vv.removeEventListener('resize', sync)
  }, [])
  const focusTimer = useRef(null)
  useEffect(() => () => clearTimeout(focusTimer.current), [])
  function handleFocus(e) {
    const el = e.target
    if (!el?.matches?.('input, select, textarea')) return
    clearTimeout(focusTimer.current)
    focusTimer.current = setTimeout(
      () => el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
      300
    )
  }

  return (
    <div
      className="game-auth-gate"
      style={viewportH ? { height: viewportH } : undefined}
      onFocus={handleFocus}
    >
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
