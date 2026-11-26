// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const seen = []
vi.mock('./AnimatedSprite', () => ({
  default: (props) => {
    seen.push(props.active)
    return <div data-testid="sprite" />
  },
}))
import HeroFigure from './HeroFigure'

afterEach(() => {
  cleanup()
  seen.length = 0
})

describe('HeroFigure', () => {
  it('animates by default', () => {
    render(<HeroFigure hero={{ name: 'Blaze' }} />)
    expect(seen.at(-1)).toBe(true)
  })
  it('a locked hero still animates (the locked look is CSS only)', () => {
    render(<HeroFigure hero={{ name: 'Blaze' }} locked />)
    expect(seen.at(-1)).toBe(true)
  })
})
