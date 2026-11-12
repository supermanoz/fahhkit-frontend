import { deleteJson, getJson, postJson, putJson } from './client'

// Device push tokens + per-category switches (DeviceTokenController and
// NotificationSettingController in the FahhKit backend).

// Idempotent upsert - registering a known token moves it to the caller, so a
// second player logging in on the same phone takes the token over.
export function registerDeviceToken(token, platform) {
  return postJson('/v1/device-token', {
    token,
    platform: platform === 'ios' ? 'IOS' : 'ANDROID',
  })
}

export function removeDeviceToken(token) {
  return deleteJson(`/v1/device-token?token=${encodeURIComponent(token)}`)
}

// { broadcastsEnabled, clubWarEnabled, territoryEnabled }
export function getNotificationSettings() {
  return getJson('/v1/notification-setting')
}

// Partial update - only the fields present are changed.
export function updateNotificationSettings(changes) {
  return putJson('/v1/notification-setting', changes)
}
