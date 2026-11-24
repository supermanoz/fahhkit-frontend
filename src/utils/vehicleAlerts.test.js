import { beforeEach, describe, expect, it, vi } from 'vitest'

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
}))
const env = vi.hoisted(() => ({ native: true, hidden: true }))
const cues = vi.hoisted(() => ({ buzz: vi.fn(), pop: vi.fn() }))

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }))
vi.mock('./geo', () => ({
  get isNative() {
    return env.native
  },
}))
vi.mock('./haptics', () => ({ buzzAlert: cues.buzz }))
vi.mock('./gameSound', () => ({
  isSfxMuted: () => false,
  playSfx: cues.pop,
}))

import {
  VEHICLE_CHANNEL_ID,
  alertVehicleDiscarded,
  alertVehicleWarning,
  resetVehicleAlertCooldown,
} from './vehicleAlerts'

beforeEach(() => {
  vi.clearAllMocks()
  resetVehicleAlertCooldown()
  env.native = true
  env.hidden = true
  ln.checkPermissions.mockResolvedValue({ display: 'granted' })
  ln.createChannel.mockResolvedValue()
  ln.schedule.mockResolvedValue()
  globalThis.document = {
    get visibilityState() {
      return env.hidden ? 'hidden' : 'visible'
    },
  }
})

describe('vehicle alerts', () => {
  it('backgrounded: posts a high-importance "Moving faster than running pace" notification', async () => {
    await alertVehicleWarning(1000)
    expect(ln.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: VEHICLE_CHANNEL_ID, importance: 5 })
    )
    const { notifications } = ln.schedule.mock.calls[0][0]
    expect(notifications[0]).toMatchObject({
      title: 'Moving faster than running pace',
      body: "Your speed is above running pace. Slow down or this run won't count.",
      channelId: VEHICLE_CHANNEL_ID,
    })
    expect(cues.buzz).not.toHaveBeenCalled()
  })

  it('foreground: buzz + pop sound, no notification', async () => {
    env.hidden = false
    await alertVehicleWarning(1000)
    expect(cues.buzz).toHaveBeenCalledTimes(1)
    expect(cues.pop).toHaveBeenCalledWith('pop')
    expect(ln.schedule).not.toHaveBeenCalled()
  })

  it('one warning per episode: repeats inside the 2 minute cooldown are dropped', async () => {
    expect(await alertVehicleWarning(0)).toBe(true)
    expect(await alertVehicleWarning(60_000)).toBe(false)
    expect(await alertVehicleWarning(119_000)).toBe(false)
    expect(await alertVehicleWarning(121_000)).toBe(true)
    expect(ln.schedule).toHaveBeenCalledTimes(2)
  })

  it('discard posts its own notification', async () => {
    await alertVehicleDiscarded()
    const { notifications } = ln.schedule.mock.calls[0][0]
    expect(notifications[0].title).toBe('Run not counted: speed too high')
  })

  it('does nothing on the web build and never throws without permission', async () => {
    env.native = false
    await alertVehicleWarning(0)
    expect(ln.schedule).not.toHaveBeenCalled()
    env.native = true
    ln.checkPermissions.mockResolvedValue({ display: 'denied' })
    resetVehicleAlertCooldown()
    await expect(alertVehicleWarning(0)).resolves.toBe(true)
    expect(ln.schedule).not.toHaveBeenCalled()
  })
})
