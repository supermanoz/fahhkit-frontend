import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClubWarHeroPicker from './ClubWarHeroPicker'
import { ToastProvider } from '../game/ui/Toast'

// Keeps the test focused on the picker's own selection/lock-in behaviour,
// not sprite-manifest/asset-loading details that belong to HeroFigure's
// own concerns.
vi.mock('./HeroFigure', () => ({
  default: () => null,
}))

const HERO_A = { id: 'hero-a', name: 'Comet', assetUrl: null }
const HERO_B = { id: 'hero-b', name: 'Bolt', assetUrl: null }

const OWNED_BOTH = [
  { storeItem: { id: 'hero-a' } },
  { storeItem: { id: 'hero-b' } },
]

function renderPicker(props = {}) {
  const onLockIn = vi.fn().mockResolvedValue(true)
  const utils = render(
    <ToastProvider>
      <ClubWarHeroPicker
        heroItems={[HERO_A, HERO_B]}
        ownedItems={OWNED_BOTH}
        lockedHeroStoreItemId={null}
        busy={false}
        onLockIn={onLockIn}
        {...props}
      />
    </ToastProvider>
  )
  return { onLockIn, ...utils }
}

beforeEach(() => {
  // jsdom doesn't implement scrollIntoView - the picker calls it whenever
  // the centred index changes.
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('ClubWarHeroPicker', () => {
  it('locks in the hero currently centred, not the one it started on', async () => {
    const { onLockIn } = renderPicker()

    // Starts on hero A (HERO_B is a sibling of a locked none).
    expect(
      screen.getByRole('button', { name: `Lock In ${HERO_A.name}` })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next hero' }))

    const lockBtn = await screen.findByRole('button', {
      name: `Lock In ${HERO_B.name}`,
    })
    fireEvent.click(lockBtn)

    expect(onLockIn).toHaveBeenCalledTimes(1)
    expect(onLockIn).toHaveBeenCalledWith(HERO_B)
  })

  it('disables the button when the centred hero is not owned', () => {
    renderPicker({ ownedItems: [{ storeItem: { id: 'hero-b' } }] })

    const btn = screen.getByRole('button', { name: /Hero locked/ })
    expect(btn).toBeDisabled()
  })

  it('does nothing when a hero card itself is tapped', () => {
    const { onLockIn } = renderPicker()

    // Both slides are mounted at once (scroll-snap, not a one-at-a-time
    // unmount) - HERO_A's name only appears on its own card.
    fireEvent.click(screen.getAllByText(HERO_A.name)[0])

    expect(onLockIn).not.toHaveBeenCalled()
    // Still on hero A - a card tap never changes the centred hero either.
    expect(
      screen.getByRole('button', { name: `Lock In ${HERO_A.name}` })
    ).toBeInTheDocument()
  })
})
