import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { isNative } from './geo'

// GamePage and most other screens draw their own full-bleed header behind
// the status bar (using the safe-area insets already in their CSS), so the
// status bar is set to overlay the webview rather than push content down.
export function initNativeShell() {
  if (!isNative) return
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
  SplashScreen.hide().catch(() => {})
}

// Called from ThemeContext whenever the theme changes, so status bar icons
// stay readable against the app's own background instead of defaulting to
// whatever the OS theme is.
export function syncStatusBarStyle(theme) {
  if (!isNative) return
  // Style.Dark means dark status bar icons (for a light background) and
  // Style.Light means light icons (for a dark background) - the inverse of
  // what the names suggest at a glance.
  StatusBar.setStyle({
    style: theme === 'dark' ? Style.Light : Style.Dark,
  }).catch(() => {})
}
