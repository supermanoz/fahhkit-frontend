// Pure state machine for the in-game auth gate (GameAuthGate.jsx) - zero
// React/DOM imports, directly unit-testable, same philosophy as
// vehicleDetection.js. GameAuthGate is the only consumer: it dispatches
// actions after each useAuthFlow() call resolves/rejects and renders
// whichever screen `state.screen` names.
export const SCREEN = Object.freeze({
  WELCOME: 'welcome',
  SIGN_IN: 'signIn',
  SIGN_UP: 'signUp',
  FORGOT: 'forgot',
  SET_PASSWORD: 'setPassword',
})

export const initialGameAuthState = {
  screen: SCREEN.WELCOME,
  banner: null,
  submitting: false,
  cooldownSeconds: 0,
  resendCooldownSeconds: 0,
  signUpSentEmail: null,
  forgotSent: false,
  pendingMobile: '',
}

export function gameAuthReducer(state, action) {
  switch (action.type) {
    case 'GO_TO':
      return { ...state, screen: action.screen, banner: null }

    case 'SUBMIT_START':
      return { ...state, submitting: true, banner: null }

    case 'SUBMIT_ERROR':
      return {
        ...state,
        submitting: false,
        banner: { kind: 'error', message: action.message },
      }

    // The website's own LoginPage rule: only a MODERATOR's first login is
    // blocked into a forced password change; a normal athlete's firstLogin
    // just signs in. See useAuthFlow.js/GameAuthGate.jsx for the call site.
    case 'SIGN_IN_NEEDS_PASSWORD_SETUP':
      return {
        ...state,
        submitting: false,
        banner: null,
        screen: SCREEN.SET_PASSWORD,
        pendingMobile: action.mobileNumber || '',
      }

    case 'AUTHENTICATED':
      return { ...state, submitting: false, banner: null }

    case 'SIGN_UP_SENT':
      return {
        ...state,
        submitting: false,
        banner: null,
        signUpSentEmail: action.email,
        resendCooldownSeconds: 30,
        pendingMobile: action.mobileNumber,
      }

    case 'RESET_SIGN_UP_SENT':
      return { ...state, signUpSentEmail: null }

    case 'FORGOT_SENT':
      return {
        ...state,
        submitting: false,
        banner: null,
        forgotSent: true,
        pendingMobile: action.mobileNumber,
      }

    case 'RESET_FORGOT_SENT':
      return { ...state, forgotSent: false }

    case 'RESEND_STARTED':
      return { ...state, resendCooldownSeconds: 30 }

    // Mirrors UpdatePasswordPage's own result exactly: the athlete is NOT
    // left signed in on the password they just set (completePasswordSetup
    // drops that token) - they land back on Sign In with a success banner,
    // same as the website.
    case 'SET_PASSWORD_DONE':
      return {
        ...state,
        submitting: false,
        screen: SCREEN.SIGN_IN,
        forgotSent: false,
        signUpSentEmail: null,
        pendingMobile: action.mobileNumber,
        banner: {
          kind: 'success',
          message: 'Password updated! Sign in with your new password.',
        },
      }

    case 'LOGIN_FAILURE_COOLDOWN':
      return { ...state, cooldownSeconds: action.seconds }

    case 'TICK_COOLDOWNS':
      return {
        ...state,
        cooldownSeconds: Math.max(0, state.cooldownSeconds - 1),
        resendCooldownSeconds: Math.max(0, state.resendCooldownSeconds - 1),
      }

    default:
      return state
  }
}
