import { Browser } from '@capacitor/browser'
import { isNative, platform } from './geo'

// The public website's own origin - where /shop (ShopPage.jsx) and
// /payment-status live, same React app as /game, just different routes.
//
// On the web this is ALWAYS window.location.origin, so every deployment
// links to itself (netlify -> netlify/shop, vercel -> vercel/shop,
// localhost -> localhost/shop). VITE_SITE_URL is deliberately NOT consulted
// there: .env.production bakes it into the web build too, which used to send
// the netlify site's coin button to vercel.
//
// Inside the native Android/iOS shell window.location.origin is wherever
// Capacitor's WebView serves the bundled dist-app/ from (never a real public
// URL), so there - and only there - VITE_SITE_URL is used, falling back to
// NATIVE_FALLBACK_SITE_URL when a native build was made without it.
const NATIVE_FALLBACK_SITE_URL = 'https://fahhkit.netlify.app'

// Pure resolver, split out so every case can be tested with simulated
// origins (e2e/site-url.spec.js).
export function resolveSiteBaseUrl({ native, origin, configured }) {
  const base = native ? configured || NATIVE_FALLBACK_SITE_URL : origin
  return base.replace(/\/+$/, '')
}

export function getSiteBaseUrl() {
  return resolveSiteBaseUrl({
    native: isNative,
    origin: window.location.origin,
    configured: import.meta.env.VITE_SITE_URL,
  })
}

// Full URL for a website page: getSiteUrl('/profile/edit'). The ONE helper
// every "open the website" button/link goes through (never hardcode a host).
export function getSiteUrl(path = '') {
  const clean = path ? `/${String(path).replace(/^\/+/, '')}` : ''
  return `${getSiteBaseUrl()}${clean}`
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
  const url = getSiteUrl(`/shop?pack=${encodeURIComponent(fahhcoinAmount)}`)
  if (isNative) {
    return Browser.open({ url })
  }
  window.open(url, '_blank', 'noopener')
  return Promise.resolve()
}
