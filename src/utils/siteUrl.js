import { Browser } from '@capacitor/browser'
import { isNative, platform } from './geo'

// The public website's own origin - where /shop (ShopPage.jsx) actually
// lives, same React app as /game, just a different route. On the web this
// is always window.location.origin (dev's localhost:5173, Vercel's own
// domain, ...) since /game and /shop are served from the same deployment -
// VITE_SITE_URL only needs to be set to override that. Inside the native
// Android/iOS shell, though, window.location.origin resolves to wherever
// Capacitor's own WebView serves the bundled dist-app/ from (its
// androidScheme, capacitor.config.json - never a real public URL), so a
// native build MUST have an explicit site URL - either VITE_SITE_URL baked
// into that build's .env, or this hardcoded production fallback.
const PRODUCTION_SITE_URL = 'https://fahhkit.vercel.app'

export function getSiteBaseUrl() {
  const configured = import.meta.env.VITE_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')
  if (isNative) return PRODUCTION_SITE_URL
  return window.location.origin
}

// Apple App Store Review Guideline 3.1.1: an app may not link out to an
// external purchase flow for a virtual/in-app currency like Fahhcoin - that
// has to go through Apple's own In-App Purchase, or the app risks
// rejection. No IOS_IAP (or any other) feature-flag mechanism existed
// anywhere in this codebase before this change (checked directly - no
// FEATURE_FLAG/featureFlag hits anywhere) - this env var is a new one,
// defaulting OFF (unset = disabled) until real Apple IAP exists for
// Fahhcoin, so the iOS build never ships this external-purchase link
// without someone deliberately turning it on. Android has no equivalent
// restriction (Google Play allows linking to web purchase flows for this
// kind of digital good) and the website obviously isn't under App Store
// review at all, so this only ever gates the iOS native case.
export const iosShopRedirectBlocked =
  platform === 'ios' && import.meta.env.VITE_IOS_IAP !== 'true'

// Opens the website's Fahhcoin shop, preselected to `pack` (the bundle's
// fahhcoinAmount - ShopPage.jsx reads this back off ?pack= to highlight the
// matching card). Never inside the game's own WebView: a new tab on the
// web (so the running game/map state in the current tab is never torn
// down), the system/Custom-Tabs browser via @capacitor/browser natively
// (Capacitor's WebView doesn't handle window.open reliably either - same
// reasoning as utils/externalLink.js's openExternal). Caller is
// responsible for the iosShopRedirectBlocked check above - this function
// doesn't refuse on its own, so a caller that already decided to show the
// disabled state can still choose not to call it.
export function openShopPack(fahhcoinAmount) {
  const url = `${getSiteBaseUrl()}/shop?pack=${encodeURIComponent(fahhcoinAmount)}`
  if (isNative) {
    return Browser.open({ url })
  }
  window.open(url, '_blank', 'noopener')
  return Promise.resolve()
}
