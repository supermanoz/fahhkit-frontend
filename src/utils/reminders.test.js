import { describe, it, expect, vi, beforeEach } from 'vitest'

// Native-only scheduling, so the Capacitor plugin and isNative are mocked.
const schedule = vi.fn(async () => {})
const cancel = vi.fn(async () => {})
const getPending = vi.fn(async () => ({ notifications: [] }))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    createChannel: vi.fn(async () => {}),
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: (...a) => schedule(...a),
    cancel: (...a) => cancel(...a),
    getPending: (...a) => getPending(...a),
  },
}))
vi.mock('./geo', () => ({ isNative: true, platform: 'android' }))

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

const { getSlotPref, setSlotPref, scheduleReminders, cancelSlotReminders } =
  await import('./reminders')

beforeEach(() => {
  store.clear()
  schedule.mockClear()
  cancel.mockClear()
  getPending.mockReset()
  getPending.mockResolvedValue({ notifications: [] })
})

describe('per-slot reminder prefs', () => {
  it('defaults every slot to on', () => {
    expect([0, 1, 2].map(getSlotPref)).toEqual([true, true, true])
  })

  it('remembers a slot switched off', () => {
    setSlotPref(1, false)
    expect(getSlotPref(1)).toBe(false)
    expect(getSlotPref(0)).toBe(true)
  })
})

describe('scheduleReminders', () => {
  it('skips slots that are switched off', async () => {
    setSlotPref(0, false)
    await scheduleReminders()
    const { notifications } = schedule.mock.calls[0][0]
    expect(notifications.length).toBeGreaterThan(0)
    // ids are dateKey * 10 + slotId
    expect(notifications.some((n) => n.id % 10 === 0)).toBe(false)
    expect(notifications.some((n) => n.id % 10 === 1)).toBe(true)
    expect(notifications.some((n) => n.id % 10 === 2)).toBe(true)
  })

  it('schedules nothing when every slot is off', async () => {
    ;[0, 1, 2].forEach((id) => setSlotPref(id, false))
    await scheduleReminders()
    expect(schedule).not.toHaveBeenCalled()
  })
})

describe('cancelSlotReminders', () => {
  it('cancels only that slot’s pending reminders', async () => {
    getPending.mockResolvedValue({
      notifications: [
        { id: 202611130, extra: { kind: 'run-reminder' } },
        { id: 202611131, extra: { kind: 'run-reminder' } },
        { id: 202611140, extra: { kind: 'run-reminder' } },
        { id: 999990, extra: { kind: 'something-else' } },
      ],
    })
    await cancelSlotReminders(0)
    expect(cancel).toHaveBeenCalledWith({
      notifications: [{ id: 202611130 }, { id: 202611140 }],
    })
  })

  it('does nothing when the slot has no pending reminders', async () => {
    await cancelSlotReminders(2)
    expect(cancel).not.toHaveBeenCalled()
  })
})
