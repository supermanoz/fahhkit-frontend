// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import IndoorRunScreen from './IndoorRunScreen'

const baseRun = (o = {}) => ({
  status: 'running',
  paused: false,
  durationSeconds: 754,
  steps: 1800,
  estimate: { meters: 1350, source: 'steps' },
  pedometerStatus: { available: true, permission: 'granted' },
  pause: vi.fn(),
  resume: vi.fn(),
  end: vi.fn(),
  discard: vi.fn(),
  resumeFromConfirm: vi.fn(),
  finish: vi.fn(),
  ...o,
})

afterEach(cleanup)

describe('IndoorRunScreen', () => {
  it('shows the big timer, live steps, estimated distance - and no map', () => {
    const { container } = render(<IndoorRunScreen run={baseRun()} />)
    expect(screen.getByText('12:34')).toBeTruthy()
    expect(screen.getByTestId('indoor-steps').textContent).toBe('1,800')
    expect(screen.getByTestId('indoor-distance').textContent).toBe('1.35')
    expect(screen.getByText(/Indoor · Training/)).toBeTruthy()
    expect(container.querySelector('canvas, .leaflet-container')).toBeNull()
  })

  it('uses the shared Pause / End / Discard buttons', () => {
    const run = baseRun()
    render(<IndoorRunScreen run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(run.pause).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'End' }))
    expect(run.end).toHaveBeenCalled()
  })

  it('paused shows Resume', () => {
    const run = baseRun({ status: 'paused', paused: true })
    render(<IndoorRunScreen run={run} />)
    expect(screen.getByText('Paused')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(run.resume).toHaveBeenCalled()
  })

  it('Discard asks first, then discards', () => {
    const run = baseRun()
    render(<IndoorRunScreen run={run} />)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(run.discard).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard run' }))
    expect(run.discard).toHaveBeenCalled()
  })

  it('denied step permission: says so, with an Open Settings link', () => {
    const onOpenSettings = vi.fn()
    render(
      <IndoorRunScreen
        run={baseRun({
          estimate: null,
          steps: null,
          pedometerStatus: { available: true, permission: 'denied' },
        })}
        onOpenSettings={onOpenSettings}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  describe('confirm screen', () => {
    const confirmRun = (o = {}) =>
      baseRun({ status: 'confirm', durationSeconds: 1800, ...o })

    it('prefills the estimated distance (km) and lets the player edit it', () => {
      const run = confirmRun({
        finish: vi.fn(() => ({ ok: true, run: { distance: 5000 } })),
      })
      const onSubmit = vi.fn()
      render(<IndoorRunScreen run={run} onSubmit={onSubmit} />)
      const input = screen.getByLabelText(/Distance on the treadmill/)
      expect(input.value).toBe('1.35')
      fireEvent.change(input, { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save run' }))
      expect(run.finish).toHaveBeenCalledWith(5000)
      expect(onSubmit).toHaveBeenCalledWith({
        ok: true,
        run: { distance: 5000 },
      })
    })

    it('a too-fast distance shows a friendly error and does not submit', () => {
      const onSubmit = vi.fn()
      const run = confirmRun({
        finish: vi.fn(() => ({
          ok: false,
          errors: [
            { code: 'too_fast', message: 'faster than the 2:30 /km limit' },
          ],
        })),
      })
      render(<IndoorRunScreen run={run} onSubmit={onSubmit} />)
      fireEvent.change(screen.getByLabelText(/Distance on the treadmill/), {
        target: { value: '20' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save run' }))
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('empty distance (no steps) asks for the treadmill number', () => {
      const run = confirmRun({ estimate: null, steps: null })
      render(<IndoorRunScreen run={run} onSubmit={vi.fn()} />)
      expect(screen.getByLabelText(/Distance on the treadmill/).value).toBe('')
      fireEvent.click(screen.getByRole('button', { name: 'Save run' }))
      expect(screen.getByRole('alert').textContent).toMatch(/treadmill/i)
    })

    it('Keep running goes back', () => {
      const run = confirmRun()
      render(<IndoorRunScreen run={run} />)
      fireEvent.click(screen.getByRole('button', { name: 'Keep running' }))
      expect(run.resumeFromConfirm).toHaveBeenCalled()
    })
  })
})
