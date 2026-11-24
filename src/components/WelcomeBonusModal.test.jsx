// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import WelcomeBonusModal from './WelcomeBonusModal'

vi.mock('framer-motion', async (orig) => ({
  ...(await orig()),
  useReducedMotion: () => true, // static version: final state immediately
}))
afterEach(cleanup)

const base = { open: true, amount: 50, name: 'Asha', ack: 'idle', error: null }

describe('WelcomeBonusModal', () => {
  it('announces the server amount and the player name (reduced motion = static)', () => {
    render(
      <WelcomeBonusModal {...base} onContinue={() => {}} onDismiss={() => {}} />
    )
    expect(screen.getByText('Welcome, Asha!')).toBeTruthy()
    expect(screen.getByTestId('welcome-bonus-amount').textContent).toContain(
      '50'
    )
  })
  it('falls back to Runner and renders nothing when closed', async () => {
    const { rerender } = render(
      <WelcomeBonusModal
        {...base}
        name=""
        onContinue={() => {}}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByText('Welcome, Runner!')).toBeTruthy()
    rerender(
      <WelcomeBonusModal
        {...base}
        open={false}
        onContinue={() => {}}
        onDismiss={() => {}}
      />
    )
    await waitFor(() =>
      expect(screen.queryByTestId('welcome-bonus-modal')).toBeNull()
    )
  })
  it("Let's Run acknowledges; sending disables it; failure shows error + retry", () => {
    const onContinue = vi.fn()
    const { rerender } = render(
      <WelcomeBonusModal
        {...base}
        onContinue={onContinue}
        onDismiss={() => {}}
      />
    )
    fireEvent.click(screen.getByTestId('welcome-bonus-continue'))
    expect(onContinue).toHaveBeenCalledTimes(1)
    rerender(
      <WelcomeBonusModal
        {...base}
        ack="sending"
        onContinue={onContinue}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByTestId('welcome-bonus-continue').disabled).toBe(true)
    rerender(
      <WelcomeBonusModal
        {...base}
        ack="failed"
        error="offline"
        onContinue={onContinue}
        onDismiss={() => {}}
      />
    )
    expect(screen.getByTestId('welcome-bonus-error').textContent).toBe(
      'offline'
    )
    expect(screen.getByTestId('welcome-bonus-continue').textContent).toBe(
      'Try again'
    )
  })
  it('X and Escape dismiss', () => {
    const onDismiss = vi.fn()
    render(
      <WelcomeBonusModal
        {...base}
        onContinue={() => {}}
        onDismiss={onDismiss}
      />
    )
    fireEvent.click(screen.getByLabelText('Close'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
