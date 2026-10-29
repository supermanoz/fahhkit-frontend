import { Haptics } from '@capacitor/haptics'
import { isNative } from './geo'

// iOS's WKWebView never implements navigator.vibrate - only Android's
// WebView does - so the buzz-buzz alert pattern used for war/challenge
// pings would silently do nothing on a native iOS build without this.
// @capacitor/haptics has no arbitrary-pattern API, just single pulses, so
// two short ones back to back stand in for the web's [120, 60, 120] pattern.
export function buzzAlert() {
  if (!isNative) {
    navigator.vibrate?.([120, 60, 120])
    return
  }
  Haptics.vibrate({ duration: 120 })
  setTimeout(() => Haptics.vibrate({ duration: 120 }), 180)
}
