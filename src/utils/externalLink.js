import { Browser } from '@capacitor/browser'
import { isNative } from './geo'
import { isSafeExternalUrl } from './safeUrl'

// Capacitor's WebView doesn't reliably handle target="_blank" (it tries to
// open a new WebView window that doesn't exist, which Android usually just
// drops) - opening explicitly through the system browser/Custom Tabs plugin
// is the documented native-safe way to send a partner link out of the app.
// A no-op passthrough on the web, where target="_blank" already just works,
// so callers can wire this unconditionally without a platform check.
export function openExternal(url, event) {
  if (!isNative || !url) return
  event?.preventDefault()
  // Never hand javascript:/data:/file:/intent: (or credentialed) URLs from
  // server content to the system browser.
  if (!isSafeExternalUrl(url)) return
  Browser.open({ url })
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
