import { MIN_VALID_RUN_DISTANCE_METERS } from './run'
import {
  NO_FIX_COPY,
  NO_FIX_TITLE,
  WEAK_GPS_COPY,
  WEAK_GPS_TITLE,
} from '../constants/runMessages'

export const RunIssueKind = Object.freeze({
  NO_FIX: 'no-fix',
  WEAK_GPS: 'weak-gps',
})

// This much of a run's fixes being too imprecise to use means the run was
// lost to GPS quality, not to anything the player did.
export const WEAK_GPS_SHARE = 0.5
export const MIN_FIXES_TO_JUDGE_GPS = 5

// Why a run that ended with (almost) nothing measured came out that way, when
// the cause is the phone's GPS rather than the player: no fixes at all, or
// most fixes worse than MAX_ACCEPTABLE_ACCURACY_METERS. null = not a GPS
// problem (the caller's own "too short" message applies). Never fraud wording.
export function describeGpsShortfall({
  fixCount = 0,
  lowAccuracyFixCount = 0,
  points = [],
  distance = 0,
} = {}) {
  if (fixCount === 0) {
    return {
      kind: RunIssueKind.NO_FIX,
      title: NO_FIX_TITLE,
      message: NO_FIX_COPY,
    }
  }
  const nothingMeasured =
    points.length === 0 || distance < MIN_VALID_RUN_DISTANCE_METERS
  if (
    nothingMeasured &&
    fixCount >= MIN_FIXES_TO_JUDGE_GPS &&
    lowAccuracyFixCount / fixCount >= WEAK_GPS_SHARE
  ) {
    return {
      kind: RunIssueKind.WEAK_GPS,
      title: WEAK_GPS_TITLE,
      message: WEAK_GPS_COPY,
    }
  }
  return null
}
