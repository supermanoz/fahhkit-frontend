import { describe, expect, it } from 'vitest'
import { SCREEN, initialGameAuthState, gameAuthReducer } from './gameAuthState'

describe('gameAuthReducer', () => {
  it('starts on the welcome screen, logged out', () => {
    expect(initialGameAuthState.screen).toBe(SCREEN.WELCOME)
    expect(initialGameAuthState.banner).toBeNull()
    expect(initialGameAuthState.submitting).toBe(false)
  })

  it('GO_TO switches screens and clears any banner', () => {
    const withBanner = {
      ...initialGameAuthState,
      banner: { kind: 'error', message: 'nope' },
    }
    const next = gameAuthReducer(withBanner, {
      type: 'GO_TO',
      screen: SCREEN.SIGN_IN,
    })
    expect(next.screen).toBe(SCREEN.SIGN_IN)
    expect(next.banner).toBeNull()
  })

  it('SUBMIT_START flags loading and clears the banner', () => {
    const start = { ...initialGameAuthState, screen: SCREEN.SIGN_IN }
    const next = gameAuthReducer(start, { type: 'SUBMIT_START' })
    expect(next.submitting).toBe(true)
    expect(next.banner).toBeNull()
  })

  it('SUBMIT_ERROR (wrong password / network error) surfaces a banner and stops loading', () => {
    const submitting = { ...initialGameAuthState, submitting: true }
    const next = gameAuthReducer(submitting, {
      type: 'SUBMIT_ERROR',
      message: 'Given credential is wrong!',
    })
    expect(next.submitting).toBe(false)
    expect(next.banner).toEqual({
      kind: 'error',
      message: 'Given credential is wrong!',
    })
  })

  it('a normal athlete sign-in (password, Google, or Apple) just authenticates', () => {
    const submitting = {
      ...initialGameAuthState,
      screen: SCREEN.SIGN_IN,
      submitting: true,
    }
    const next = gameAuthReducer(submitting, { type: 'AUTHENTICATED' })
    expect(next.submitting).toBe(false)
    expect(next.banner).toBeNull()
    // AUTHENTICATED never changes which screen is recorded - GameAuthGate
    // itself stops rendering the gate once the caller's isAuthed flips true.
    expect(next.screen).toBe(SCREEN.SIGN_IN)
  })

  it("a moderator's first login is routed to Set Password instead of signing in", () => {
    const submitting = {
      ...initialGameAuthState,
      screen: SCREEN.SIGN_IN,
      submitting: true,
    }
    const next = gameAuthReducer(submitting, {
      type: 'SIGN_IN_NEEDS_PASSWORD_SETUP',
      mobileNumber: '9800000000',
    })
    expect(next.screen).toBe(SCREEN.SET_PASSWORD)
    expect(next.pendingMobile).toBe('9800000000')
    expect(next.submitting).toBe(false)
  })

  it('sign-up success records the sent email and starts the resend cooldown', () => {
    const submitting = {
      ...initialGameAuthState,
      screen: SCREEN.SIGN_UP,
      submitting: true,
    }
    const next = gameAuthReducer(submitting, {
      type: 'SIGN_UP_SENT',
      email: 'sita@gmail.com',
      mobileNumber: '9811111111',
    })
    expect(next.signUpSentEmail).toBe('sita@gmail.com')
    expect(next.resendCooldownSeconds).toBe(30)
    expect(next.pendingMobile).toBe('9811111111')
    expect(next.submitting).toBe(false)
  })

  it('RESET_SIGN_UP_SENT clears the sent-email confirmation (Back from the sent screen)', () => {
    const sent = { ...initialGameAuthState, signUpSentEmail: 'sita@gmail.com' }
    const next = gameAuthReducer(sent, { type: 'RESET_SIGN_UP_SENT' })
    expect(next.signUpSentEmail).toBeNull()
  })

  it('forgot-password success flips forgotSent and remembers the mobile number', () => {
    const submitting = {
      ...initialGameAuthState,
      screen: SCREEN.FORGOT,
      submitting: true,
    }
    const next = gameAuthReducer(submitting, {
      type: 'FORGOT_SENT',
      mobileNumber: '9822222222',
    })
    expect(next.forgotSent).toBe(true)
    expect(next.pendingMobile).toBe('9822222222')
    expect(next.submitting).toBe(false)
  })

  it('RESET_FORGOT_SENT clears the sent confirmation (Back from the sent screen)', () => {
    const sent = { ...initialGameAuthState, forgotSent: true }
    const next = gameAuthReducer(sent, { type: 'RESET_FORGOT_SENT' })
    expect(next.forgotSent).toBe(false)
  })

  it('RESEND_STARTED restarts the 30s resend cooldown', () => {
    const next = gameAuthReducer(initialGameAuthState, {
      type: 'RESEND_STARTED',
    })
    expect(next.resendCooldownSeconds).toBe(30)
  })

  it('setting a new password ends the flow on its own success step, not auto-authenticated', () => {
    const submitting = {
      ...initialGameAuthState,
      screen: SCREEN.SET_PASSWORD,
      submitting: true,
      forgotSent: true,
      signUpSentEmail: 'sita@gmail.com',
    }
    const next = gameAuthReducer(submitting, {
      type: 'SET_PASSWORD_DONE',
      mobileNumber: '9800000000',
    })
    expect(next.screen).toBe(SCREEN.SET_PASSWORD)
    expect(next.passwordUpdated).toBe(true)
    expect(next.banner).toBeNull()
    expect(next.forgotSent).toBe(false)
    expect(next.signUpSentEmail).toBeNull()
    expect(next.pendingMobile).toBe('9800000000')
    // Its Sign In button: leaving the success step resets it.
    const signIn = gameAuthReducer(next, {
      type: 'GO_TO',
      screen: SCREEN.SIGN_IN,
    })
    expect(signIn.passwordUpdated).toBe(false)
    expect(signIn.pendingMobile).toBe('9800000000')
  })

  it('SUBMIT_ERROR can carry a warning kind (amber) instead of the default error', () => {
    const next = gameAuthReducer(initialGameAuthState, {
      type: 'SUBMIT_ERROR',
      kind: 'warning',
      message: 'x',
    })
    expect(next.banner).toEqual({ kind: 'warning', message: 'x' })
  })

  it('CLEAR_BANNER dismisses the notice (field edited / retry) and is a no-op without one', () => {
    const withBanner = {
      ...initialGameAuthState,
      banner: { kind: 'error', message: 'x' },
    }
    expect(
      gameAuthReducer(withBanner, { type: 'CLEAR_BANNER' }).banner
    ).toBeNull()
    expect(
      gameAuthReducer(initialGameAuthState, { type: 'CLEAR_BANNER' })
    ).toBe(initialGameAuthState)
  })

  it('SUBMIT_CANCELLED returns to idle showing nothing (player closed the Google/Apple sheet)', () => {
    const next = gameAuthReducer(
      {
        ...initialGameAuthState,
        submitting: true,
        banner: { kind: 'error', message: 'x' },
      },
      { type: 'SUBMIT_CANCELLED' }
    )
    expect(next.submitting).toBe(false)
    expect(next.banner).toBeNull()
  })

  it('LOGIN_FAILURE_COOLDOWN records the throttle cooldown', () => {
    const next = gameAuthReducer(initialGameAuthState, {
      type: 'LOGIN_FAILURE_COOLDOWN',
      seconds: 30,
    })
    expect(next.cooldownSeconds).toBe(30)
  })

  it('TICK_COOLDOWNS counts both cooldowns down and floors at zero', () => {
    const ticking = {
      ...initialGameAuthState,
      cooldownSeconds: 1,
      resendCooldownSeconds: 0,
    }
    const next = gameAuthReducer(ticking, { type: 'TICK_COOLDOWNS' })
    expect(next.cooldownSeconds).toBe(0)
    expect(next.resendCooldownSeconds).toBe(0)
  })

  it('an unknown action is a no-op', () => {
    const next = gameAuthReducer(initialGameAuthState, {
      type: 'NOT_A_REAL_ACTION',
    })
    expect(next).toBe(initialGameAuthState)
  })
})
