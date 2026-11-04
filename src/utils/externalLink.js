import { Browser } from '@capacitor/browser'
import { isNative } from './geo'

// Capacitor's WebView doesn't reliably handle target="_blank" (it tries to
// open a new WebView window that doesn't exist, which Android usually just
// drops) - opening explicitly through the system browser/Custom Tabs plugin
// is the documented native-safe way to send a partner link out of the app.
// A no-op passthrough on the web, where target="_blank" already just works,
// so callers can wire this unconditionally without a platform check.
export function openExternal(url, event) {
  if (!isNative || !url) return
  event?.preventDefault()
  Browser.open({ url })
}
