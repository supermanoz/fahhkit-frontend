// The ONE place that words the run header: the in-game run panel (expanded
// and collapsed - same header) and the Android run notification title both
// read this, so they can never disagree.

export const RUN_MODE = Object.freeze({
  CONQUER: 'conquer',
  PVP: 'pvp',
  CLUB_WAR: 'clubwar',
  TRAINING: 'training',
  BOSS: 'boss',
})

const LABELS = {
  [RUN_MODE.CONQUER]: 'Territory Capture',
  [RUN_MODE.PVP]: 'PvP Battle',
  [RUN_MODE.CLUB_WAR]: 'Club War Run',
  [RUN_MODE.TRAINING]: 'Training',
  [RUN_MODE.BOSS]: 'Boss Fight',
}

// Mode from the tracker's start() options (a plain Conquer run has none).
export function getRunMode({
  isTraining,
  clubWarId,
  challengeId,
  bossId,
} = {}) {
  if (isTraining) return RUN_MODE.TRAINING
  if (clubWarId != null) return RUN_MODE.CLUB_WAR
  if (challengeId != null) return RUN_MODE.PVP
  if (bossId != null) return RUN_MODE.BOSS
  return RUN_MODE.CONQUER
}

// `state`: 'paused' appends " · Paused". Unknown/missing mode = "Running".
export function getRunModeLabel(mode, state) {
  const label = LABELS[mode] || 'Running'
  return state === 'paused' ? `${label} · Paused` : label
}
