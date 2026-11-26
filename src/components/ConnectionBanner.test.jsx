// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const conn = vi.hoisted(() => ({ online: true, subs: new Set() }))
vi.mock('../utils/connectivity', async () => {
  const React = await import('react')
  return {
    useIsOnline: () =>
      React.useSyncExternalStore(
        (fn) => {
          conn.subs.add(fn)
          return () => conn.subs.delete(fn)
        },
        () => conn.online
      ),
  }
})
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => children,
  motion: {
    div: ({ children, ...p }) => {
      const { initial, animate, exit, transition, ...rest } = p
      void initial
      void animate
      void exit
      void transition
      return <div {...rest}>{children}</div>
    },
  },
  useReducedMotion: () => true,
}))

import ConnectionBanner, { BACK_ONLINE_MS } from './ConnectionBanner'
import {
  clearStorageProblem,
  reportStorageProblem,
} from '../utils/storageHealth'

const setOnline = (v) =>
  act(() => {
    conn.online = v
    conn.subs.forEach((f) => f())
  })

beforeEach(() => {
  vi.useFakeTimers()
  conn.online = true
  clearStorageProblem()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ConnectionBanner', () => {
  it('is hidden while online with nothing waiting', () => {
    render(<ConnectionBanner />)
    expect(screen.queryByTestId('connection-banner')).toBeNull()
  })
  it('offline: pill with the waiting-run count and the map chip', () => {
    render(<ConnectionBanner waiting={2} />)
    setOnline(false)
    expect(screen.getByTestId('connection-banner').textContent).toMatch(
      /offline - 2 runs saved on your phone/
    )
    expect(screen.getByTestId('map-offline-chip')).toBeTruthy()
  })
  it('offline with nothing waiting keeps the plain wording', () => {
    render(<ConnectionBanner waiting={0} />)
    setOnline(false)
    expect(screen.getByTestId('connection-banner').textContent).toMatch(
      /runs are saved on your phone/
    )
  })
  it('back online, then uploading the saved runs until they are gone', () => {
    const { rerender } = render(<ConnectionBanner waiting={1} />)
    setOnline(false)
    setOnline(true)
    expect(screen.getByTestId('connection-banner').dataset.state).toBe('back')
    act(() => vi.advanceTimersByTime(BACK_ONLINE_MS + 10))
    expect(screen.getByTestId('connection-banner').dataset.state).toBe(
      'syncing'
    )
    expect(screen.getByTestId('connection-banner').textContent).toMatch(
      /Uploading 1 run saved/
    )
    rerender(<ConnectionBanner waiting={0} />)
    expect(screen.queryByTestId('connection-banner')).toBeNull()
  })
  it('a full phone beats everything else', () => {
    render(<ConnectionBanner waiting={3} />)
    act(() => reportStorageProblem('full'))
    const b = screen.getByTestId('connection-banner')
    expect(b.dataset.state).toBe('storage')
    expect(b.textContent).toMatch(/storage is full/i)
  })
  it('tapping the pill calls onOpen (jump to the pending list)', () => {
    const onOpen = vi.fn()
    render(<ConnectionBanner waiting={1} onOpen={onOpen} />)
    setOnline(false)
    screen.getByTestId('connection-banner').click()
    expect(onOpen).toHaveBeenCalled()
  })
})
