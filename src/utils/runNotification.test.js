import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ platform: 'ios', isNative: true }))
const plugins = vi.hoisted(() => {
  const make = () => ({
    start: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  })
  return { RunNotification: make(), RunLiveActivity: make() }
})
vi.mock('@capacitor/core', () => ({
  registerPlugin: (name) => plugins[name],
}))
vi.mock('./geo', () => ({
  get platform() {
    return state.platform
  },
  get isNative() {
    return state.isNative
  },
}))
const requestPermission = vi.hoisted(() =>
  vi.fn(() => Promise.resolve('granted'))
)
vi.mock('./notificationPermission', () => ({
  requestNotificationPermission: requestPermission,
}))

import {
  pauseRunNotification,
  startRunNotification,
  stopRunNotification,
  updateRunNotification,
} from './runNotification'

beforeEach(() => {
  vi.clearAllMocks()
  state.platform = 'ios'
  state.isNative = true
})

describe('run notification routing', () => {
  it('iOS: same calls go to RunLiveActivity, with no permission prompt', async () => {
    await startRunNotification({
      elapsedMs: 5000,
      distanceMeters: 120,
      paceLabel: '5:30',
      title: 'Training',
    })
    updateRunNotification({ distanceMeters: 150 })
    pauseRunNotification({ title: 'Paused' })
    stopRunNotification()
    const p = plugins.RunLiveActivity
    expect(p.start).toHaveBeenCalledWith({
      elapsedMs: 5000,
      distanceMeters: 120,
      paceLabel: '5:30',
      title: 'Training',
    })
    expect(p.update).toHaveBeenCalledOnce()
    expect(p.pause).toHaveBeenCalledWith({ title: 'Paused' })
    expect(p.stop).toHaveBeenCalledOnce()
    expect(plugins.RunNotification.start).not.toHaveBeenCalled()
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('Android: still uses RunNotification', async () => {
    state.platform = 'android'
    await startRunNotification({ title: 'Training' })
    stopRunNotification()
    expect(plugins.RunNotification.start).toHaveBeenCalled()
    expect(plugins.RunNotification.stop).toHaveBeenCalled()
    expect(plugins.RunLiveActivity.start).not.toHaveBeenCalled()
  })

  it('web: nothing is called', async () => {
    state.platform = 'web'
    state.isNative = false
    await startRunNotification()
    updateRunNotification({ distanceMeters: 1 })
    stopRunNotification()
    for (const p of Object.values(plugins))
      for (const fn of Object.values(p)) expect(fn).not.toHaveBeenCalled()
  })
})
