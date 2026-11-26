// Plain-language text for the backend's run error codes (RunErrorCode, in the
// error body as `errorCode`), so a player never reads a raw code or a
// developer sentence. Unknown code -> the server's own text if it is a normal
// sentence, else a generic line.
import { MAX_SUBMISSION_AGE_DAYS } from './runLate'

const COPY = {
  RUN_TOO_OLD: `This run is more than ${MAX_SUBMISSION_AGE_DAYS} days old, so it can no longer be uploaded.`,
  RUN_TIME_IN_FUTURE:
    "This run's time is in the future. Check that your phone's date and time are correct.",
  RUN_TIMES_INCONSISTENT:
    "This run's start, end and duration don't add up. Check that your phone's date and time are correct.",
  RUN_TOO_MANY_POINTS: 'This run recorded too many GPS points to upload.',
  RUN_POINT_TIMES_INVALID:
    "This run's GPS times don't match its start and end, so it can't be uploaded.",
  EMPTY_POINTS: 'No GPS route was recorded for this run.',
  NO_ACCURATE_POINTS:
    "The GPS signal was too weak during this run, so it couldn't be counted.",
  INVALID_RUN_MODE: "This kind of run can't be uploaded this way.",
  RUN_ALREADY_EXISTS: 'You have already logged a run for this event.',
  TEMPORARILY_BUSY: 'The server is busy. We will try again shortly.',
}

export function runErrorMessage(err) {
  const code = err?.errorCode
  if (code && COPY[code]) return COPY[code]
  const text = typeof err?.message === 'string' ? err.message : ''
  // Never surface a code-looking or empty message.
  if (!text || /^[A-Z0-9_ ]{4,}$/.test(text)) {
    return 'The server could not accept this run.'
  }
  return text
}

// Codes where the run can never be accepted: retrying is pointless.
export const PERMANENT_RUN_CODES = new Set(
  Object.keys(COPY).filter((c) => c !== 'TEMPORARILY_BUSY')
)
