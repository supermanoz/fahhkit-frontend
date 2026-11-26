// Google / Apple sign-in configuration, cross-checked across the places that
// must agree (capacitor config, iOS plist + Info.plist + entitlements, Android
// google-services.json + strings.xml + gradle, the Apple bundle id the app
// sends, and - when the backend repo is checked out next to this one - the
// backend's accepted audiences). A mismatch here is exactly what shows up as
// "DEVELOPER_ERROR", "AUDIENCE_MISMATCH" or a dead callback on a real phone.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const json = (p) => JSON.parse(read(p))
const plistValue = (xml, key) =>
  xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1]

const cap = json('capacitor.config.json')
const google = cap.plugins.GoogleAuth
const gsPlist = read('ios/App/App/GoogleService-Info.plist')
const info = read('ios/App/App/Info.plist')
const services = json('android/app/google-services.json')
const strings = read('android/app/src/main/res/values/strings.xml')
const gradle = read('android/app/build.gradle')
const pbx = read('ios/App/App.xcodeproj/project.pbxproj')

describe('Google - iOS', () => {
  it('capacitor iosClientId = GoogleService-Info CLIENT_ID', () => {
    expect(google.iosClientId).toBe(plistValue(gsPlist, 'CLIENT_ID'))
  })
  it('Info.plist has the REVERSED_CLIENT_ID URL scheme (the Google callback)', () => {
    const reversed = plistValue(gsPlist, 'REVERSED_CLIENT_ID')
    expect(reversed).toBe(
      `com.googleusercontent.apps.${google.iosClientId.replace('.apps.googleusercontent.com', '')}`
    )
    expect(info).toContain(`<string>${reversed}</string>`)
  })
  it('the plist bundle id is the app target bundle id', () => {
    const bundle = plistValue(gsPlist, 'BUNDLE_ID')
    expect(bundle).toBe('com.runconquest.app')
    expect(pbx).toContain(`PRODUCT_BUNDLE_IDENTIFIER = ${bundle};`)
  })
  it('SceneDelegate forwards URLs to Capacitor (the Google callback)', () => {
    const scene = read('ios/App/App/SceneDelegate.swift')
    expect(scene).toMatch(/openURLContexts/)
    expect(scene).toMatch(
      /ApplicationDelegateProxy\.shared\.application\([^)]*open: context\.url/
    )
  })
})

describe('Google - Android', () => {
  const client = services.client[0]
  it('google-services.json is for the app package', () => {
    expect(client.client_info.android_client_info.package_name).toBe(
      'com.runconquest.game'
    )
    expect(gradle).toMatch(/applicationId "com\.runconquest\.game"/)
  })
  it('the web (type 3) client in google-services.json is the serverClientId', () => {
    const web = client.oauth_client.find((c) => c.client_type === 3)
    expect(web.client_id).toBe(google.serverClientId)
  })
  it('capacitor androidClientId, serverClientId and strings.xml server_client_id agree', () => {
    expect(google.androidClientId).toBe(google.serverClientId)
    expect(strings).toContain(
      `<string name="server_client_id">${google.serverClientId}</string>`
    )
  })
  it('an Android (type 1) OAuth client with a certificate exists for the package', () => {
    const android = client.oauth_client.filter((c) => c.client_type === 1)
    expect(android.length).toBeGreaterThan(0)
    for (const c of android)
      expect(c.android_info.certificate_hash).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('Apple - iOS', () => {
  it.each(['App.entitlements', 'AppRelease.entitlements'])(
    '%s has the Sign in with Apple capability',
    (file) => {
      const ent = read(`ios/App/App/${file}`)
      expect(ent).toMatch(
        /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>/
      )
    }
  )
  it('the plugin is installed and in the Podfile', () => {
    expect(json('package.json').dependencies).toHaveProperty(
      '@capacitor-community/apple-sign-in'
    )
    expect(read('ios/App/Podfile')).toContain('CapacitorCommunityAppleSignIn')
  })
  it('the Apple client id the app sends is the iOS bundle id', () => {
    expect(read('src/utils/appleSignIn.js')).toContain(
      "const APPLE_CLIENT_ID = 'com.runconquest.app'"
    )
  })
})

describe('build flags', () => {
  it.each(['.env.production', '.env.staging'])(
    '%s turns on native Google + Apple sign-in for iOS',
    (file) => {
      const env = read(file)
      expect(env).toMatch(/^VITE_IOS_GOOGLE=true$/m)
      expect(env).toMatch(/^VITE_IOS_APPLE_SIGNIN=true$/m)
    }
  )
})

// ---- backend audiences (only when the backend repo sits next to this one) ----
const backendProps = path.resolve(
  root,
  '../fahhkit/src/main/resources/application.properties'
)
const hasBackend = fs.existsSync(backendProps)
const listOf = (props, key) => {
  const raw = props.match(new RegExp(`^${key}=\\{(.*)\\}`, 'm'))?.[1] ?? ''
  return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

describe.skipIf(!hasBackend)('backend accepts our audiences', () => {
  const props = hasBackend ? fs.readFileSync(backendProps, 'utf8') : ''
  const googleIds = listOf(props, 'google.oauth.client.ids')
  const appleIds = listOf(props, 'apple.oauth.client.ids')

  it('Google: the serverClientId (iOS + Android ID-token audience) is allowed', () => {
    expect(googleIds).toContain(google.serverClientId)
  })
  it('Google: the web client id (VITE_GOOGLE_CLIENT_ID) is allowed', () => {
    const web = read('.env.production').match(
      /^VITE_GOOGLE_CLIENT_ID=(.+)$/m
    )[1]
    expect(googleIds).toContain(web)
  })
  it('Google: the iOS client id is allowed too (safety net)', () => {
    expect(googleIds).toContain(google.iosClientId)
  })
  it('Apple: the iOS bundle id is an allowed audience', () => {
    expect(appleIds).toContain('com.runconquest.app')
  })
})
