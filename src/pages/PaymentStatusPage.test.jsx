import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const getTerritoryProfile = vi.fn()
const postJson = vi.fn()
const getJson = vi.fn()

vi.mock('../api/territory', () => ({
  getTerritoryProfile: (...a) => getTerritoryProfile(...a),
}))
vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { id: 'u1' }, isAuthed: true }),
}))
vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {},
  getJson: (...a) => getJson(...a),
  postJson: (...a) => postJson(...a),
}))
vi.mock('../components/Navbar', () => ({ default: () => null }))
vi.mock('../components/Footer', () => ({ default: () => null }))
vi.mock('../components/CoinStack', () => ({ default: () => null }))

import PaymentStatusPage from './PaymentStatusPage'
import { __resetForTests } from '../state/coins'

function renderAt(search) {
  return render(
    <MemoryRouter initialEntries={[`/payment-status${search}`]}>
      <PaymentStatusPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  __resetForTests()
  cleanup()
  vi.clearAllMocks()
  getTerritoryProfile.mockResolvedValue({ fahhcoinBalance: 500 })
})

describe('/payment-status (coin purchase)', () => {
  it.each([
    ['PAID', 'Fahhcoin added!'],
    ['PENDING', 'Payment pending'],
    ['FAILED', "Payment didn't go through"],
    ['CANCELLED', 'Payment cancelled'],
    ['EXPIRED', 'Payment link expired'],
    ['REFUNDED', 'Payment refunded'],
    ['Completed', 'Fahhcoin added!'],
    ['User canceled', 'Payment cancelled'],
  ])('status %s shows "%s"', async (status, title) => {
    renderAt(`?purchaseId=p1&status=${encodeURIComponent(status)}`)
    expect(
      await screen.findByRole('heading', { name: title })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Return to the game' })
    ).toBeInTheDocument()
  })

  it('unknown status shows an error, never a success screen', async () => {
    renderAt('?purchaseId=p1&status=hacked')
    expect(
      await screen.findByText(/Could not resolve that payment/)
    ).toBeInTheDocument()
    expect(screen.queryByText('Fahhcoin added!')).toBeNull()
  })

  it('only PAID shows a balance; a failed payment never does', async () => {
    renderAt('?purchaseId=p1&status=FAILED')
    await screen.findByText("Payment didn't go through")
    expect(screen.queryByText(/New balance/)).toBeNull()
  })

  it('PAID shows the server balance', async () => {
    renderAt('?purchaseId=p1&status=PAID')
    expect(await screen.findByText('500')).toBeInTheDocument()
  })

  it('is refresh safe: re-rendering the same URL only reads, never POSTs or credits', async () => {
    const first = renderAt('?purchaseId=p1&status=PAID')
    await screen.findByText('Fahhcoin added!')
    first.unmount()
    renderAt('?purchaseId=p1&status=PAID')
    await screen.findByText('Fahhcoin added!')
    expect(postJson).not.toHaveBeenCalled()
    expect(getJson).not.toHaveBeenCalled()
  })

  it('Return to the game opens the app scheme and shows a manual hint', async () => {
    const loc = { href: '' }
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: loc,
    })
    try {
      renderAt('?purchaseId=p1&status=PAID')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Return to the game' })
      )
      expect(loc.href).toBe('runconquest://payment-return')
      expect(
        screen.getByText(/switch back to the Run Conquest app/)
      ).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      })
    }
  })
})
