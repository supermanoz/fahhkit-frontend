import { isNative } from './geo'
import { gpxForRecord } from './gpx'
import { downloadBlob } from './shareCanvas'

// Hands the run's GPX to the player: the OS share sheet in the native app (a
// blob download does nothing inside the WebView), a file download on the web.
// -> 'shared' | 'downloaded' | 'cancelled'; throws on a real failure.
export async function exportGpxFile(record) {
  const { xml, filename } = gpxForRecord(record)
  const blob = new Blob([xml], { type: 'application/gpx+xml' })
  if (!isNative) {
    downloadBlob(blob, filename)
    return 'downloaded'
  }
  const { shareImageFile, SAVE_STATUS } = await import('./saveImage')
  const r = await shareImageFile(blob, filename)
  return r.status === SAVE_STATUS.CANCELLED ? 'cancelled' : 'shared'
}
