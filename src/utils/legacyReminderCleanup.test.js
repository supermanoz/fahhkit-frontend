import { describe, it, expect, vi, beforeEach } from 'vitest'

const cancel = vi.fn(async () => {})
const deleteChannel = vi.fn(async () => {})
const getPending = vi.fn()

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    getPending: (...a) => getPending(...a),
    cancel: (...a) => cancel(...a),
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

const { removeLegacyReminders } = await import('./legacyReminderCleanup')

beforeEach(() => {
  store.clear()
  native = true
  vi.clearAllMocks()
})

describe('removeLegacyReminders', () => {
  it('cancels only reminder notifications, deletes the channel, clears prefs', async () => {
    getPending.mockResolvedValue({
      notifications: [
        { id: 202611201, title: 'x', extra: { kind: 'run-reminder' } },
        { id: 202611212, title: 'y', channelId: 'run_reminders' },
        {
          id: 5,
          title: 'Run Conquest',
          schedule: { at: new Date() },
        },
        {
          id: 999999,
          title: 'Run Conquest',
          extra: { kind: 'run-reminder-test' },
        },
        { id: 77, title: 'Club War', extra: { kind: 'club-war' } },
        { id: 78, title: 'Hello', channelId: 'other' },
      ],
    })
    store.set('runconquest.remindersEnabled', 'true')
    store.set('runconquest.reminderSlot.1', 'false')
    store.set('runconquest.reminderPromptShown', 'true')
    store.set('unrelated', 'keep')

    await removeLegacyReminders()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel.mock.calls[0][0].notifications.map((n) => n.id)).toEqual([
      202611201, 202611212, 5, 999999,
    ])
    expect(deleteChannel).toHaveBeenCalledWith({ id: 'run_reminders' })
    expect(store.has('runconquest.remindersEnabled')).toBe(false)
    expect(store.has('runconquest.reminderSlot.1')).toBe(false)
    expect(store.has('runconquest.reminderPromptShown')).toBe(false)
    expect(store.get('unrelated')).toBe('keep')
    expect(store.get('runconquest.remindersRemoved')).toBe('1')
  })

  it('runs once only', async () => {
    getPending.mockResolvedValue({ notifications: [] })
    await removeLegacyReminders()
    await removeLegacyReminders()
    expect(getPending).toHaveBeenCalledTimes(1)
  })

  it('is a no-op on web', async () => {
    native = false
    await removeLegacyReminders()
    expect(getPending).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
  })

  it('stays safe and retries next launch if the plugin throws', async () => {
    getPending.mockRejectedValue(new Error('not implemented'))
    await expect(removeLegacyReminders()).resolves.toBeUndefined()
    expect(store.has('runconquest.remindersRemoved')).toBe(false)
  })
})
