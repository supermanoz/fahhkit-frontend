import { registerPlugin } from '@capacitor/core'
import { isNative } from './geo'

// Native-shell top safe area. The status bar overlays the WebView
// (nativeShell.js) but Android's WebView reports env(safe-area-inset-top) as
// 0, so top-pinned UI (level badge, coins, panel headers) sat under the
// clock/camera notch. SafeAreaPlugin.java reports the real height; it lands
// in --native-safe-top, which index.css folds into --safe-top / --hud-top.
// The browser build never sets any of this, so the web layout is untouched.
const SafeArea = registerPlugin('SafeArea')

// Used when native but the plugin is missing, errors, or reports 0 (older
// APKs, iOS where env() is already right and the plugin doesn't exist).
export const NATIVE_MIN_SAFE_TOP = 28

export function resolveNativeSafeTop(reported) {
  const n = Number(reported)
  return Number.isFinite(n) && n > 0 ? n : NATIVE_MIN_SAFE_TOP
}

function apply(top) {
  const root = document.documentElement
  root.style.setProperty('--native-safe-top', `${resolveNativeSafeTop(top)}px`)
}

export function initSafeArea() {
  if (!isNative) return
  const root = document.documentElement
  root.dataset.native = 'true'
  // Right away with the fallback so nothing paints under the bar while the
  // bridge call is in flight, then refine with the real value.
  apply(0)
  SafeArea.getInsets()
    .then((r) => apply(r?.top))
    .catch(() => {})
  SafeArea.addListener?.('insets', (r) => apply(r?.top))?.catch?.(() => {})
}
