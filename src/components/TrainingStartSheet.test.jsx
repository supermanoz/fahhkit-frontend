// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TrainingStartSheet from './TrainingStartSheet'

beforeEach(() => localStorage.clear())

afterEach(cleanup)

describe('TrainingStartSheet', () => {
  it('Outdoor is the default and starts outdoor', () => {
    const onStart = vi.fn()
    render(<TrainingStartSheet onStart={onStart} onClose={vi.fn()} />)
    expect(
      screen
        .getByRole('radio', { name: 'Outdoor' })
        .getAttribute('aria-checked')
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onStart).toHaveBeenCalledWith('outdoor')
  })

  it('Indoor (treadmill) starts indoor and is remembered next time', () => {
    const onStart = vi.fn()
    const { unmount } = render(
      <TrainingStartSheet onStart={onStart} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Indoor (treadmill)' }))
    expect(screen.getByText(/No GPS and no map/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onStart).toHaveBeenCalledWith('indoor')
    unmount()
    render(<TrainingStartSheet onStart={vi.fn()} onClose={vi.fn()} />)
    expect(
      screen
        .getByRole('radio', { name: 'Indoor (treadmill)' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })
})
