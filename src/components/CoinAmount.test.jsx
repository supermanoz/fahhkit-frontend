// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import CoinAmount from './CoinAmount'

afterEach(cleanup)

describe('CoinAmount', () => {
  it('formats long values with commas (12,500) in the shared class', () => {
    render(<CoinAmount value={12500} data-testid="a" />)
    expect(screen.getByTestId('a')).toHaveTextContent('12,500')
    expect(screen.getByTestId('a')).toHaveClass('coin-amount')
  })
  it('shows a placeholder text and defaults to 0', () => {
    render(
      <>
        <CoinAmount text="—" data-testid="p" />
        <CoinAmount data-testid="z" />
      </>
    )
    expect(screen.getByTestId('p')).toHaveTextContent('—')
    expect(screen.getByTestId('z')).toHaveTextContent('0')
  })
})
