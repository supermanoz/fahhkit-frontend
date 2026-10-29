// Vehicle-detection (anti-cheat) thresholds for live run tracking — see
// src/utils/vehicleDetection.js for the state machine that consumes these and
// src/hooks/useRunTracker.js for where it's wired into GPS/motion sampling.
// Every number here is deliberately named and isolated so it can be tuned
// without touching the detection logic itself.

// Rolling window used to smooth consecutive GPS fixes into one speed reading,
// so a single noisy fix can't trip anything on its own (10-15s per spec).
export const WINDOW_SECONDS = 12

// Sustained speed above this (with motion sensors corroborating a lack of
// running gait) is "suspicious" - ~25.2 km/h, well past genuine running pace
// but still reachable on a bike/scooter.
export const SUSPECT_SPEED_MS = 7
// No motion sensor to corroborate with (denied/unsupported) - speed alone has
// to look faster still before it's worth a warning, same philosophy the old
// useRunTracker fallback used.
export const SUSPECT_SPEED_FALLBACK_MS = 8.5
// Sustained speed above this is "vehicle" - ~43 km/h. Matches the backend's
// own TerritoryAntiCheatProperties.maxSustainedSpeedMetersPerSecond so the
// client's real-time pause and the server's after-the-fact rejection agree.
export const VEHICLE_SPEED_MS = 12

// How long SUSPECT-level evidence has to hold before entering/leaving states -
// hysteresis so a single GPS wobble can't flip the state machine.
export const SUSPECT_SUSTAIN_SECONDS = 15
export const VEHICLE_SUSTAIN_SECONDS = 8
export const CLEAR_SUSTAIN_SECONDS = 6
// Sustained valid running speed + cadence required to leave VEHICLE and
// resume distance/territory credit (20-30s per spec).
export const RESUME_SECONDS = 25

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
// movement - discarded from both distance and evidence, mirroring the
// backend's own filterTeleportingPoints.
export const MAX_PLAUSIBLE_SPEED_MS = 40

// Coefficient-of-variation floor for "suspiciously constant speed" - real
// running pace wobbles; a long stretch this flat (above BRISK_SPEED_MS) reads
// as cruise-controlled.
export const CONSTANT_SPEED_VARIANCE_THRESHOLD = 0.06

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
