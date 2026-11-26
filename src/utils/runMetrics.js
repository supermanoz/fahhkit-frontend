// Steps and elevation of a run, shown wherever the server (or the phone) has
// them. Every helper returns null for "unknown" so callers can hide the row:
// a missing value is never shown as 0, "null" or a made-up number.
// Server fields (RunSummaryResponse / RunDetailResponse): steps,
// elevationGainMeters, elevationLossMeters.

import { isIndoorRun } from './indoorRuns'

const fin = (v) => {
  if (v == null || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Steps: a real count is > 0. 0 means "no step data" (the server drops
// implausible counts to null, and a sensor that gave nothing reads 0).
export function stepsOf(run) {
  const n = fin(run?.steps)
  return n != null && n > 0 ? Math.round(n) : null
}

// Elevation is a real measurement even when it is 0 (a flat run), so 0 stays;
// only null / non-numeric / negative is unknown.
export function elevationGainOf(run) {
  const n = fin(run?.elevationGainMeters)
  return n != null && n >= 0 ? n : null
}
export function elevationLossOf(run) {
  const n = fin(run?.elevationLossMeters)
  return n != null && n >= 0 ? n : null
}

export const formatSteps = (n) => n.toLocaleString('en-US')
export const formatElevationMeters = (m) => `${Math.round(m)} m`

// [{ key, label, value }] for the detail view / result card - only rows that
// have a value.
export function runExtraStats(run) {
  const rows = []
  // Indoor (treadmill) runs say so wherever the stats show - and on the share
  // card, which has no route to draw.
  if (isIndoorRun(run))
    rows.push({ key: 'mode', label: 'Mode', value: 'Indoor' })
  const steps = stepsOf(run)
  const gain = elevationGainOf(run)
  const loss = elevationLossOf(run)
  if (steps != null)
    rows.push({ key: 'steps', label: 'Steps', value: formatSteps(steps) })
  if (gain != null)
    rows.push({
      key: 'gain',
      label: 'Elev. gain',
      value: formatElevationMeters(gain),
    })
  if (loss != null)
    rows.push({
      key: 'loss',
      label: 'Elev. loss',
      value: formatElevationMeters(loss),
    })
  return rows
}

// The share image has little room: steps and climb only (no loss).
export function shareExtraStats(run) {
  return runExtraStats(run)
    .filter((r) => r.key !== 'loss')
    .map(({ label, value }) => ({
      label: label === 'Elev. gain' ? 'Climb' : label,
      value,
    }))
}
