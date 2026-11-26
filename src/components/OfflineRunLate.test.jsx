// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import OfflineRunSavedModal from './OfflineRunSavedModal'
import PendingRunsList from './PendingRunsList'

afterEach(cleanup)
const NOW = Date.parse('2026-03-10T12:00:00Z')
const ago = (h) => new Date(NOW - h * 3600 * 1000).toISOString()
const rec = (over = {}, status = 'waiting') => ({
  clientRunId: 'run-1',
  status,
  summary: {
    mode: 'conquer',
    distance: 3000,
    duration: 900,
    startedAt: ago(50),
    endedAt: ago(49.7),
    ...over,
  },
})

describe('Run saved popup', () => {
  it('Conquer: saved, uploads when online, territory pending + 48 h warning', () => {
    render(<OfflineRunSavedModal run={rec()} onClose={() => {}} />)
    expect(screen.getByTestId('offline-saved-status').textContent).toMatch(
      /Waiting for internet/
    )
    expect(document.body.textContent).toMatch(/upload by itself/)
    expect(document.body.textContent).toMatch(/Territory/)
    expect(
      screen.getByTestId('offline-saved-late-warning').textContent
    ).toMatch(/48 hours/)
  })
  it('Training: no territory wording and no 48 h warning', () => {
    render(
      <OfflineRunSavedModal
        run={rec({ mode: 'training' })}
        onClose={() => {}}
      />
    )
    expect(document.body.textContent).not.toMatch(/Territory/)
    expect(screen.queryByTestId('offline-saved-late-warning')).toBeNull()
  })
})

describe('Pending runs: late territory note', () => {
  it('a queued Conquer run past 48 h says territory will not count', () => {
    render(<PendingRunsList runs={[rec()]} now={NOW} />)
    expect(screen.getByTestId('pending-run-late').textContent).toMatch(
      /Too late for territory/
    )
  })
  it('close to the limit it warns with the hours left', () => {
    render(<PendingRunsList runs={[rec({ endedAt: ago(40) })]} now={NOW} />)
    expect(screen.getByTestId('pending-run-late').textContent).toMatch(
      /8 h left/
    )
  })
  it('a fresh run, a Training run and a finished run show nothing', () => {
    render(
      <PendingRunsList
        runs={[
          rec({ endedAt: ago(1) }),
          { ...rec({ mode: 'training' }), clientRunId: 'run-2' },
          { ...rec(), clientRunId: 'run-3', status: 'done' },
        ]}
        now={NOW}
      />
    )
    expect(screen.queryByTestId('pending-run-late')).toBeNull()
  })
})
