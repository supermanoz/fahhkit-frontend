import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const schedule = vi.fn(async () => {})
const cancel = vi.fn(async () => {})
const createChannel = vi.fn(async () => {})
const checkPermissions = vi.fn(async () => ({ display: 'granted' }))
const requestPermissions = vi.fn(async () => ({ display: 'granted' }))
const getPending = vi.fn(async () => ({ notifications: [] }))
const deleteChannel = vi.fn(async () => {})

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: (...a) => schedule(...a),
    cancel: (...a) => cancel(...a),
    createChannel: (...a) => createChannel(...a),
    checkPermissions: (...a) => checkPermissions(...a),
    requestPermissions: (...a) => requestPermissions(...a),
    getPending: (...a) => getPending(...a),
    deleteChannel: (...a) => deleteChannel(...a),
  },
}))
let native = true
vi.mock('./geo', () => ({
  get isNative() {
    return native
  },
}))

const store = new Map()
globalThis.window = { localStorage: undefined }
globalThis.window.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

let mod
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  store.clear()
  native = true
  checkPermissions.mockResolvedValue({ display: 'granted' })
  mod = await import('./dailyNudge')
})
afterEach(() => vi.useRealTimers())

// Local-time dates, so the tests hold in any timezone.
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m)

describe('computeNudgeTime', () => {
  it('is exactly 24h later inside the 7:00-21:00 window', () => {
    expect(mod.computeNudgeTime(at(10, 12, 30))).toEqual(at(11, 12, 30))
    expect(mod.computeNudgeTime(at(10, 7, 0))).toEqual(at(11, 7, 0))
    expect(mod.computeNudgeTime(at(10, 21, 0))).toEqual(at(11, 21, 0))
  })
  it('moves late-evening times to the next 9:00', () => {
    expect(mod.computeNudgeTime(at(10, 22, 15))).toEqual(at(12, 9, 0))
    expect(mod.computeNudgeTime(at(10, 21, 1))).toEqual(at(12, 9, 0))
  })
  it('moves early-morning times to 9:00 the same day', () => {
    expect(mod.computeNudgeTime(at(10, 5, 59))).toEqual(at(11, 9, 0))
    expect(mod.computeNudgeTime(at(10, 6, 59))).toEqual(at(11, 9, 0))
  })
})

describe('scheduleDailyNudge', () => {
  it('cancels the pending one and schedules a single new one 24h out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(at(10, 14, 0))
    await mod.scheduleDailyNudge()
    expect(cancel).toHaveBeenCalledWith({
      notifications: [{ id: mod.NUDGE_ID }],
    })
    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'daily_nudge', importance: 3 })
    )
    expect(schedule).toHaveBeenCalledTimes(1)
    const n = schedule.mock.calls[0][0].notifications
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({
      id: mod.NUDGE_ID,
      title: 'Run Conquest',
      channelId: 'daily_nudge',
      smallIcon: 'ic_stat_notify',
      extra: { kind: 'daily-nudge' },
    })
    expect(n[0].body).toBeTruthy()
    expect(n[0].schedule.at).toEqual(at(11, 14, 0))
    expect(n[0].schedule.every).toBeUndefined()
  })

  it('re-running (run finished) replaces rather than adds', async () => {
    await mod.scheduleDailyNudge(at(10, 10))
    await mod.scheduleDailyNudge(at(10, 18))
    expect(schedule).toHaveBeenCalledTimes(2)
    expect(schedule.mock.calls[1][0].notifications[0].id).toBe(mod.NUDGE_ID)
    expect(schedule.mock.calls[1][0].notifications[0].schedule.at).toEqual(
      at(11, 18)
    )
  })

  it('shifts quiet-hours times to 9:00', async () => {
    await mod.scheduleDailyNudge(at(10, 23, 0))
    expect(schedule.mock.calls[0][0].notifications[0].schedule.at).toEqual(
      at(12, 9, 0)
    )
  })

  it.each(['denied', 'prompt'])(
    'does nothing (and never asks) when permission is %s',
    async (display) => {
      checkPermissions.mockResolvedValue({ display })
      await mod.scheduleDailyNudge()
      expect(schedule).not.toHaveBeenCalled()
      expect(createChannel).not.toHaveBeenCalled()
      expect(requestPermissions).not.toHaveBeenCalled()
    }
  )

  it('does nothing on web', async () => {
    native = false
    await mod.scheduleDailyNudge()
    await mod.cancelDailyNudge()
    expect(schedule).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('never cancels or removes the new nudge when cleaning up the old ones', async () => {
    getPending.mockResolvedValue({
      notifications: [
        { id: 20261110, extra: { kind: 'run-reminder' } },
        {
          id: mod.NUDGE_ID,
          title: 'Run Conquest',
          channelId: 'daily_nudge',
          schedule: { at: new Date() },
          extra: { kind: 'daily-nudge' },
        },
      ],
    })
    await mod.scheduleDailyNudge()
    const cleanup = cancel.mock.calls.find((c) =>
      c[0].notifications.some((n) => n.id === 20261110)
    )
    expect(cleanup[0].notifications).toEqual([{ id: 20261110 }])
    expect(schedule).toHaveBeenCalledTimes(1)
  })
})

describe('cancelDailyNudge (logout)', () => {
  it('cancels the fixed-id notification', async () => {
    await mod.cancelDailyNudge()
    expect(cancel).toHaveBeenCalledWith({
      notifications: [{ id: mod.NUDGE_ID }],
    })
    expect(schedule).not.toHaveBeenCalled()
  })
})
