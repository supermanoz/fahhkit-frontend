// Vehicle-detection (anti-cheat) thresholds for live run tracking — see
// src/utils/vehicleDetection.js for the state machine that consumes these and
// src/hooks/useRunTracker.js for where it's wired into GPS/motion sampling.
// Every number here is deliberately named and isolated so it can be tuned
// without touching the detection logic itself.

// --- Speed rules (all speeds are m/s, smoothed over a sliding window of
// *accepted* fixes; see utils/vehicleDetection.js) ---

// Window used to smooth consecutive GPS fixes into one speed reading, so a
// single noisy fix can't trip anything on its own.
export const WINDOW_SECONDS = 25
// The window must actually cover this much time before it can convict
// (otherwise 2 fast fixes after a signal gap would be "sustained").
export const MIN_WINDOW_COVERAGE_SECONDS = 15

// Sustained average speed above this over the window = vehicle (~25 km/h).
// A world-class sprint is ~10 m/s but only for seconds, never for 25 s.
export const VEHICLE_SPEED_MS = 7
// Average pace faster than 2:30 /km (6.67 m/s) over 60 s = vehicle too -
// catches the slower end a 25 s window would let through.
export const FAST_PACE_SPEED_MS = 1000 / 150
export const FAST_PACE_WINDOW_SECONDS = 60
// 5-7 m/s held for more than 60 s = "suspicious" (a bike): banner only.
export const BIKE_SPEED_MS = 5
export const BIKE_SUSTAIN_SECONDS = 60

// Evidence has to persist this long before a state change (hysteresis).
export const SUSPECT_SUSTAIN_SECONDS = 5
export const VEHICLE_SUSTAIN_SECONDS = 3
// After a vehicle warning: valid running (speed back under BIKE_SPEED_MS
// over the last RESUME_WINDOW_SECONDS, plus cadence when it can be sensed)
// for this long clears it and counting resumes.
export const RESUME_SECONDS = 5
export const RESUME_WINDOW_SECONDS = 6
// How long the player has to slow down before the run is discarded.
export const VEHICLE_WARNING_SECONDS = 30
// Vehicle time carries across episodes (a bus stopping at a stop must not
// reset the clock) and is forgotten after this long without a vehicle.
export const WARNING_MEMORY_SECONDS = 180
// Minimum gap between two "vehicle detected" notifications.
export const VEHICLE_NOTIFY_COOLDOWN_SECONDS = 120

// Running cadence range (steps/sec) - below MIN_CADENCE_HZ while moving fast
// reads as "no running gait detected" (vehicle or bike).
export const MIN_CADENCE_HZ = 1.2
export const MAX_CADENCE_HZ = 3.5
// Trailing window used to compute the current cadence rate.
export const CADENCE_WINDOW_SECONDS = 8
// Below this speed, "no cadence detected" could just be walking or standing
// still - not worth treating as vehicle evidence either way.
export const BRISK_SPEED_MS = 3

// Peak-detection on accelerometer magnitude (moved from useRunTracker's old
// inline step detector so it's unit-testable with synthetic traces).
export const STEP_MIN_INTERVAL_MS = 250
export const STEP_ACCEL_DEVIATION_MPS2 = 3

// Fixes noisier than this are ignored for detection purposes (distinct from
// utils/run.js's stricter MAX_ACCEPTABLE_ACCURACY_METERS=20, which already
// drops points before they ever reach the detector in production - this gate
// exists so the detector is still correct when fed raw/synthetic traces).
export const ACCURACY_LIMIT_METERS = 30

// Ignore the first few seconds of a run - GPS hasn't settled yet.
export const SKIP_INITIAL_SECONDS = 5

// A gap between fixes longer than this is a tunnel/signal drop, not a moving
// segment - discarded from evidence (never counted as vehicle), but doesn't
// reset whatever state/hysteresis was already building either.
export const GAP_SECONDS = 20

// A single-fix implied speed above this is a GPS jump/teleport, not real
// movement - unless the very next fix confirms it (a motorway at 30 m/s) - discarded from both distance and evidence, mirroring the
// backend's own filterTeleportingPoints.
export const MAX_PLAUSIBLE_SPEED_MS = 25

// No accelerometer sample for this long = the sensor went quiet (screen
// locked / throttled WebView): stop requiring a running gait.
export const NO_MOTION_TIMEOUT_SECONDS = 10

// If this fraction (or more) of a run's distance ends up vehicle-excluded,
// the whole run is marked invalid client-side. Matches the backend's
// TerritoryAntiCheatProperties.maxSustainedSpeedViolationRatio.
export const VEHICLE_RUN_INVALID_RATIO = 0.3

// Accessibility mode (wheelchair/hand-cycle athletes never show a running
// footstrike cadence) raises the speed ceilings and skips the cadence
// requirement entirely, relying on speed-only evidence at a higher bar.
export const ACCESSIBILITY_SPEED_MULTIPLIER = 1.6

// TEMP: local-device-only toggle (localStorage) - there's no backend field
// for this preference yet. See utils/antiCheatSettings.js.
export const ACCESSIBILITY_STORAGE_KEY = 'fahhkit_anticheat_accessibility_mode'
export const DEBUG_OVERLAY_STORAGE_KEY = 'fahhkit_anticheat_debug'
