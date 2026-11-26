// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PendingRunsList from './PendingRunsList'

afterEach(cleanup)
const NOW = Date.parse('2026-03-10T12:00:00Z')
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString()
const rec = (id, status, over = {}, extra = {}) => ({
  clientRunId: id,
  status,
  summary: {
    mode: 'training',
    distance: 3000,
    duration: 900,
    startedAt: ago(2),
    endedAt: ago(1.7),
    ...over,
  },
  ...extra,
})
const handlers = () => ({
  onRetry: vi.fn(),
  onDelete: vi.fn(),
  onSync: vi.fn(),
  onExport: vi.fn().mockResolvedValue('shared'),
})

describe('PendingRunsList', () => {
  it('renders nothing when the outbox is empty', () => {
    const { container } = render(<PendingRunsList runs={[]} now={NOW} />)
    expect(container.firstChild).toBeNull()
  })
  it('Sync now appears for waiting runs and calls the flush', async () => {
    const h = handlers()
    render(<PendingRunsList runs={[rec('a', 'waiting')]} now={NOW} {...h} />)
    await userEvent.click(screen.getByTestId('pending-sync'))
    expect(h.onSync).toHaveBeenCalledTimes(1)
  })
  it('deleting a WAITING run needs a confirm; Keep cancels', async () => {
    const h = handlers()
    render(<PendingRunsList runs={[rec('a', 'waiting')]} now={NOW} {...h} />)
    await userEvent.click(screen.getByTestId('pending-delete'))
    expect(h.onDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('pending-confirm').textContent).toMatch(
      /hasn.t been saved on the server/
    )
    await userEvent.click(screen.getByText('Keep'))
    expect(h.onDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('pending-delete'))
    await userEvent.click(screen.getByTestId('pending-confirm-delete'))
    expect(h.onDelete).toHaveBeenCalledWith('a')
  })
  it('a FAILED run: Retry, Export and Delete (no confirm)', async () => {
    const h = handlers()
    render(
      <PendingRunsList
        runs={[rec('f', 'failed', {}, { error: { message: 'No' } })]}
        now={NOW}
        {...h}
      />
    )
    await userEvent.click(screen.getByText('Retry'))
    expect(h.onRetry).toHaveBeenCalledWith('f')
    await userEvent.click(screen.getByTestId('pending-delete'))
    expect(h.onDelete).toHaveBeenCalledWith('f')
  })
  it('a too-old failed run cannot be retried but can still be exported', async () => {
    const h = handlers()
    const r = rec(
      'o',
      'failed',
      {},
      {
        error: { message: 'Too old', errorCode: 'RUN_TOO_OLD' },
      }
    )
    render(<PendingRunsList runs={[r]} now={NOW} {...h} />)
    expect(screen.queryByText('Retry')).toBeNull()
    await userEvent.click(screen.getByTestId('pending-export'))
    expect(h.onExport).toHaveBeenCalledWith(r)
  })
  it('an uploading run can be neither deleted nor exported', () => {
    render(
      <PendingRunsList
        runs={[rec('u', 'uploading')]}
        now={NOW}
        {...handlers()}
      />
    )
    expect(screen.queryByTestId('pending-delete')).toBeNull()
    expect(screen.queryByTestId('pending-export')).toBeNull()
  })
  it('a failed export shows a message instead of failing silently', async () => {
    const h = handlers()
    h.onExport.mockRejectedValue(new Error('x'))
    render(<PendingRunsList runs={[rec('a', 'waiting')]} now={NOW} {...h} />)
    await userEvent.click(screen.getByTestId('pending-export'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/export/i)
  })
  it('shows the upload deadline when it is close (14-day limit)', () => {
    render(
      <PendingRunsList
        runs={[rec('a', 'waiting', { endedAt: ago(12 * 24 + 2) })]}
        now={NOW}
        {...handlers()}
      />
    )
    expect(screen.getByTestId('pending-run-expiry').textContent).toMatch(
      /Expires in 2 days/
    )
  })
})
