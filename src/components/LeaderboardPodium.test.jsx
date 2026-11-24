// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LeaderboardPodium, { LeaderboardDock } from './LeaderboardPodium'

const entry = (rank, extra = {}) => ({
  key: `k${rank}`,
  rank,
  name: `Runner ${rank}`,
  area: <span>{rank * 10} m²</span>,
  ...extra,
})
const rows = (from, n) => Array.from({ length: n }, (_, i) => entry(from + i))
const pager = (over = {}) => ({
  page: 1,
  hasPrev: false,
  hasNext: true,
  loading: false,
  error: null,
  range: '1-20',
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onRetry: vi.fn(),
  ...over,
})
const me = (over = {}) => ({
  rank: 1178,
  name: 'Flash',
  area: <span>5 m²</span>,
  ...over,
})

afterEach(cleanup)

describe('LeaderboardPodium paging + pinned You row', () => {
  it('page 1 shows the podium (top 3) plus rows 4-20', () => {
    const { container } = render(
      <LeaderboardPodium entries={rows(1, 20)} page={1} pager={pager()} />
    )
    expect(container.querySelector('.lb-podium')).toBeTruthy()
    expect(
      container.querySelectorAll(
        '.lb-podium-spot button, button.lb-podium-spot'
      )
    ).toHaveLength(3)
    expect(container.querySelectorAll('.lb-list .lb-row')).toHaveLength(17)
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.getByText(/1-20/)).toBeTruthy()
  })

  it('page 2 has no podium: all 20 rows are plain list rows (21-40)', () => {
    const { container } = render(
      <LeaderboardPodium
        entries={rows(21, 20)}
        page={2}
        pager={pager({ page: 2, hasPrev: true, range: '21-40' })}
      />
    )
    expect(container.querySelector('.lb-podium')).toBeNull()
    expect(container.querySelectorAll('.lb-list .lb-row')).toHaveLength(20)
    expect(screen.getByText(/21-40/)).toBeTruthy()
  })

  it('Prev / Next call the handlers; Prev is disabled on page 1', () => {
    const p = pager()
    render(<LeaderboardPodium entries={rows(1, 20)} page={1} pager={p} />)
    expect(screen.getByLabelText('Previous page').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(p.onNext).toHaveBeenCalledTimes(1)
  })

  it('docks the You row with a rank outside the page, formatted 1,178', () => {
    render(<LeaderboardDock me={me()} />)
    const pinned = screen.getByTestId('lb-pinned-you')
    expect(within(pinned).getByText('1,178')).toBeTruthy()
    expect(within(pinned).getByText('Flash')).toBeTruthy()
    expect(within(pinned).getByText('You')).toBeTruthy()
    expect(within(pinned).getByText('5 m²')).toBeTruthy()
  })

  it('unranked user shows a dash, no fake number', () => {
    render(<LeaderboardDock me={me({ rank: null })} />)
    const pinned = screen.getByTestId('lb-pinned-you')
    expect(within(pinned).getByText('—')).toBeTruthy()
    expect(within(pinned).queryByText(/\d{2,}/)).toBeNull()
  })

  it('renders nothing when there is nothing to dock (no club)', () => {
    render(<LeaderboardDock me={null} />)
    expect(screen.queryByTestId('lb-pinned-you')).toBeNull()
  })

  it('the dock is not part of the podium/list (it is a sibling the parent places)', () => {
    const { container } = render(
      <LeaderboardPodium entries={rows(1, 20)} page={1} pager={pager()} />
    )
    expect(container.querySelector('.lb-pinned-you')).toBeNull()
  })

  it('a failed page shows the message and Retry, and the current rows stay', () => {
    const p = pager({ error: { message: 'Could not load page 2.', page: 2 } })
    const { container } = render(
      <LeaderboardPodium entries={rows(1, 20)} page={1} pager={p} />
    )
    expect(screen.getByRole('alert').textContent).toMatch(
      /Could not load page 2/
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(p.onRetry).toHaveBeenCalled()
    expect(container.querySelectorAll('.lb-list .lb-row')).toHaveLength(17)
  })

  it('the old page is dimmed (not replaced) while loading', () => {
    const { container } = render(
      <LeaderboardPodium
        entries={rows(21, 20)}
        page={2}
        pager={pager({ page: 2, hasPrev: true, loading: true })}
      />
    )
    expect(container.querySelector('.lb-page.is-loading')).toBeTruthy()
    expect(container.querySelectorAll('.lb-list .lb-row')).toHaveLength(20)
  })

  it('no pager when everything fits one page', () => {
    render(
      <LeaderboardPodium
        entries={rows(1, 5)}
        page={1}
        pager={pager({ hasNext: false })}
      />
    )
    expect(screen.queryByTestId('lb-pager')).toBeNull()
  })
})
