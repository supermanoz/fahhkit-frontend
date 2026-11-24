import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Boom() {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  it('shows a reload fallback instead of crashing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary name="t">
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Reload')).toBeTruthy()
  })
  it('renders children when fine', () => {
    render(<ErrorBoundary>ok</ErrorBoundary>)
    expect(screen.getByText('ok')).toBeTruthy()
  })
})
