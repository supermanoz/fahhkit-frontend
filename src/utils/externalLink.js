import { Browser } from '@capacitor/browser'
import { isNative } from './geo'
import { isSafeExternalUrl } from './safeUrl'

// The ONE way to send the user to a page/app outside the game WebView.
//
//  - web:    window.open(url, '_blank', 'noopener') (a new tab; the running
//            game/map in this tab is never torn down).
//  - native: @capacitor/browser (SFSafariViewController / Custom Tabs).
//            Capacitor's WebView doesn't handle target="_blank" or
//            window.open reliably (iOS drops them), so never rely on those.
//  - { app: true }: for links that should open their own app when installed
//            (Instagram...). A top-level https navigation is handed to the OS
//            by Capacitor (iOS: UIApplication.open -> the universal link opens
//            the app, otherwise Safari; Android: an ACTION_VIEW intent), so no
//            custom scheme / LSApplicationQueriesSchemes entry is needed.
//
// Safe to call from an anchor's onClick (pass the event: the anchor's own
// navigation is suppressed) or from a button (no event). Returns a promise
// that never rejects. Only http(s) URLs are ever opened - javascript:, data:,
// file:, intent: and credentialed URLs from server content are dropped. For
// mailto:/tel: use openMailto / openTel below.
export function openExternal(url, event, { app = false } = {}) {
  if (!url) return Promise.resolve()
  event?.preventDefault()
  if (!isSafeExternalUrl(url)) return Promise.resolve()
  if (!isNative) {
    window.open(url, '_blank', 'noopener')
    return Promise.resolve()
  }
  if (app) {
    window.location.href = url
    return Promise.resolve()
  }
  return Browser.open({ url }).catch(() => {
    // The in-app browser could not be shown: hand the link to the OS instead
    // of leaving the tap dead.
    window.location.href = url
  })
}

// mailto: links. On the web the plain <a href="mailto:..."> already opens the
// default mail client. In the native app the click is turned into a
// top-level navigation to the mailto: URL, which Capacitor's bridge hands to
// the system (the mail app) instead of loading it inside the game WebView.
export function openMailto(address, event) {
  if (!isNative || !address) return
  event?.preventDefault()
  window.location.href = `mailto:${address}`
}

// tel: links, same mechanism as openMailto (plain anchors already work on the
// web).
export function openTel(number, event) {
  if (!isNative || !number) return
  event?.preventDefault()
  window.location.href = `tel:${String(number).replace(/[^\d+]/g, '')}`
}

// Copies text for the "no mail app" fallback. Returns true on success.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
