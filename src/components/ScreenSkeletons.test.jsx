import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  ColorShelfSkeleton,
  HeroGallerySkeleton,
  LoadFailed,
  MeSkeleton,
  ShopSkeleton,
  WalletSkeleton,
} from './ScreenSkeletons'
import HeroGallery from './HeroGallery'

afterEach(cleanup)

describe('Me skeleton', () => {
  it('covers hero, XP bar, avatar, name, summary, stat tiles and rows', () => {
    const { container } = render(<MeSkeleton />)
    expect(screen.getByTestId('me-skeleton')).toHaveAttribute('role', 'status')
    // Reuses the real screen's wrappers, so sizes follow the real layout.
    for (const cls of [
      '.game-menu-hero',
      '.game-level-hud',
      '.profile-avatar-card',
      '.game-menu-player-name',
      '.game-menu-summary',
      '.sk-stat',
      '.sk-row',
    ])
      expect(container.querySelector(cls), cls).not.toBeNull()
    expect(container.querySelectorAll('.sk-stat').length).toBe(4)
    // Skeleton blocks are decorative.
    container
      .querySelectorAll('.g-skeleton')
      .forEach((n) => expect(n).toHaveAttribute('aria-hidden', 'true'))
  })
})

describe('Shop skeletons', () => {
  it('hero gallery: arrows, 380px-stage wrapper, name, button, dots', () => {
    const { container } = render(<HeroGallerySkeleton />)
    expect(container.querySelector('.hero-roster-stage')).not.toBeNull()
    expect(container.querySelectorAll('.hero-roster-dots > *').length).toBe(4)
    expect(screen.getByTestId('shop-skeleton')).toHaveAttribute(
      'aria-label',
      'Loading heroes'
    )
  })

  it('color shelf: a grid of real-sized cards (frame, window, name, foot)', () => {
    const { container } = render(<ColorShelfSkeleton />)
    expect(container.querySelectorAll('.cs-card').length).toBe(6)
    expect(container.querySelectorAll('.cs-window').length).toBe(6)
    expect(container.querySelectorAll('.cs-foot').length).toBe(6)
  })

  it('ShopSkeleton picks by section; wallet pill has its own', () => {
    const a = render(<ShopSkeleton section="heroes" />)
    expect(a.container.querySelector('.hero-roster')).not.toBeNull()
    a.unmount()
    const b = render(<ShopSkeleton section="trail" />)
    expect(b.container.querySelector('.cs-grid')).not.toBeNull()
    b.unmount()
    render(<WalletSkeleton />)
    expect(screen.getByTestId('wallet-skeleton')).toBeInTheDocument()
  })

  it('HeroGallery shows the skeleton (not text) while the roster loads, and the empty note once loaded', () => {
    const props = {
      heroes: [],
      ownedItems: [],
      activeHeroId: null,
      onSelect: vi.fn(),
      onEquip: vi.fn(),
    }
    const { rerender } = render(<HeroGallery {...props} loading />)
    expect(screen.getByTestId('shop-skeleton')).toBeInTheDocument()
    rerender(<HeroGallery {...props} loading={false} />)
    expect(screen.queryByTestId('shop-skeleton')).toBeNull()
    expect(screen.getByText(/No heroes have answered/)).toBeInTheDocument()
  })
})

describe('LoadFailed', () => {
  it('shows the message and Retry calls back', () => {
    const onRetry = vi.fn()
    render(<LoadFailed message="Couldn't load the shop." onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the shop."
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
