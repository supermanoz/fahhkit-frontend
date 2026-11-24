// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import GameButton from './GameButton'

afterEach(cleanup)

describe('GameButton', () => {
  it('renders a button with the variant/size classes and a label', () => {
    render(
      <GameButton variant="danger" size="sm" fullWidth>
        Discard
      </GameButton>
    )
    const b = screen.getByRole('button', { name: 'Discard' })
    expect(b.className).toMatch(/gbtn-danger/)
    expect(b.className).toMatch(/gbtn-sm/)
    expect(b.className).toMatch(/gbtn-full/)
    expect(b.getAttribute('type')).toBe('button')
  })
  it('unknown variant falls back to primary', () => {
    render(<GameButton variant="nope">Go</GameButton>)
    expect(screen.getByText('Go').parentElement.className).toMatch(
      /gbtn-primary/
    )
  })
  it('click works; disabled and loading never fire it', () => {
    const fn = vi.fn()
    const { rerender } = render(<GameButton onClick={fn}>A</GameButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
    rerender(
      <GameButton onClick={fn} disabled>
        A
      </GameButton>
    )
    fireEvent.click(screen.getByRole('button'))
    rerender(
      <GameButton onClick={fn} loading>
        A
      </GameButton>
    )
    const b = screen.getByRole('button')
    fireEvent.click(b)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-busy')).toBe('true')
    // label stays in the DOM while loading (width stays stable)
    expect(screen.getByText('A')).toBeTruthy()
  })
  it('as link: renders <a href>, disabled link is aria-disabled and untabbable', () => {
    const { rerender } = render(<GameButton href="/x">Open</GameButton>)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/x')
    rerender(
      <GameButton href="/x" disabled>
        Open
      </GameButton>
    )
    const a = screen.getByRole('link')
    expect(a.getAttribute('aria-disabled')).toBe('true')
    expect(a.getAttribute('tabindex')).toBe('-1')
  })
  it('tab variant exposes selected state', () => {
    render(
      <GameButton variant="tab" selected>
        Players
      </GameButton>
    )
    const t = screen.getByRole('tab')
    expect(t.getAttribute('aria-selected')).toBe('true')
    expect(t.className).toMatch(/is-selected/)
  })
})
