// GPX 1.1 export of a recorded run, built from the outbox record's payload
// points ({lat, lng, timestamp (epoch ms), elevation?}). Pure and local: the
// player can always take their run out of the app (storage full, a run the
// server refused or that is too old to upload).
const esc = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]
  )

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export function buildGpx({ points = [], name = 'Run Conquest run' } = {}) {
  const valid = points.filter((p) => isNum(p?.lat) && isNum(p?.lng))
  const pts = valid
    .map((p) => {
      const ele = isNum(p.elevation) ? `<ele>${p.elevation}</ele>` : ''
      const t = isNum(p.timestamp)
        ? `<time>${new Date(p.timestamp).toISOString()}</time>`
        : ''
      return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}${t}</trkpt>`
    })
    .join('\n')
  const first = valid.find((p) => isNum(p.timestamp))
  const meta = first
    ? `  <metadata><time>${new Date(first.timestamp).toISOString()}</time></metadata>\n`
    : ''
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="Run Conquest" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    meta +
    `  <trk>\n    <name>${esc(name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`
  )
}

export function gpxFilename(record) {
  const when = new Date(record?.summary?.startedAt ?? Date.now())
  const stamp = Number.isNaN(when.getTime())
    ? 'run'
    : when.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
  return `run-conquest-${stamp}.gpx`
}

export function gpxForRecord(record) {
  return {
    xml: buildGpx({
      points: record?.payload?.points ?? [],
      name: `Run Conquest ${record?.summary?.startedAt ?? ''}`.trim(),
    }),
    filename: gpxFilename(record),
  }
}
