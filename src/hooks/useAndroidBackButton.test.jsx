import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Hardware Back in the native app: closes the topmost open layer, never exits
// or ends a run mid-run (minimises instead), asks before exiting when idle.
const listeners = []
const minimizeApp = vi.fn(() => Promise.resolve())
const exitApp = vi.fn()
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_event, cb) => {
      listeners.push(cb)
      return Promise.resolve({ remove: vi.fn() })
    },
    minimizeApp: (...a) => minimizeApp(...a),
    exitApp: (...a) => exitApp(...a),
  },
}))
vi.mock('../utils/geo', () => ({ isNative: true }))

import { useAndroidBackButton } from './useAndroidBackButton'

const press = () => act(() => listeners[listeners.length - 1]())

describe('useAndroidBackButton', () => {
  beforeEach(() => {
    listeners.length = 0
    minimizeApp.mockClear()
    exitApp.mockClear()
  })

  it('closes the topmost open layer first and swallows the press', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    const { result } = renderHook(() =>
      useAndroidBackButton({
        layers: [
          { isOpen: () => true, close: closeA },
          { isOpen: () => true, close: closeB },
        ],
        blocked: false,
      })
    )
    press()
    expect(closeA).toHaveBeenCalledOnce()
    expect(closeB).not.toHaveBeenCalled()
    expect(result.current.exitConfirmOpen).toBe(false)
    expect(minimizeApp).not.toHaveBeenCalled()
  })

  it('at the main screen asks before exiting (no accidental close)', () => {
    const { result } = renderHook(() =>
      useAndroidBackButton({ layers: [], blocked: false })
    )
    press()
    expect(result.current.exitConfirmOpen).toBe(true)
    expect(exitApp).not.toHaveBeenCalled()
    act(() => result.current.confirmExit())
    expect(exitApp).toHaveBeenCalledOnce()
  })

  it('during an active run minimises and never exits or asks', () => {
    const { result } = renderHook(() =>
      useAndroidBackButton({ layers: [], blocked: true })
    )
    press()
    expect(minimizeApp).toHaveBeenCalledOnce()
    expect(exitApp).not.toHaveBeenCalled()
    expect(result.current.exitConfirmOpen).toBe(false)
  })
})
