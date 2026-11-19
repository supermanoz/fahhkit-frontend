// Plain-language explanations of hero perks, keyed by perk id (the backend's
// ScoreComponentTypeConstant). ONE place to edit the copy; every description
// below was written from what the backend really does (see HeroAbilityServiceImpl,
// TerritoryScoringServiceImpl, TerritoryProcessingServiceImpl and
// RunChallengeServiceImpl), not from the label:
//
//  - A perk only works while its hero is EQUIPPED.
//  - Territory-score perks multiply ONE part of a run's score by the hero's
//    multiplier (e.g. x1.05); the parts are added up, so the whole score grows
//    by less than the perk's percentage. That score is what has to beat a
//    rival's score to take their land. The parts: area = ln(1 + area), shape =
//    50 x roundness, pace = 20 x pace score, closing = 10 x closing score,
//    distance = 2 x km (up to 10 km).
//  - Pace and distance also count when a loop does not close, and in Club War.
//    Area, shape and closing only count on a closed loop. Training and Conquer
//    are the same mode on the server.
//  - Race time only applies to PvP: the finished time is multiplied by the
//    perk (x0.95 = 5% shorter) before the race is judged.
//  - XP and coins are not affected by any perk.
//  - A hero can have at most 2 perks; the stronger counts fully, the other at
//    half strength.

export const PERK_MODES = Object.freeze({
  CONQUER: 'Conquer',
  TRAINING: 'Training',
  CLUB_WAR: 'Club War',
  PVP: 'PvP',
})

const fmt = (n) => String(Number(n.toFixed(1)))
const mmss = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`

const LOOP_MODES = [PERK_MODES.CONQUER, PERK_MODES.TRAINING]
const EFFORT_MODES = [
  PERK_MODES.CONQUER,
  PERK_MODES.TRAINING,
  PERK_MODES.CLUB_WAR,
]

// Each entry: name, summary (one line on the card), sentence(p, up), example(m),
// where (modes it really works in). `p` is the percentage, `up` is true when
// the multiplier raises the score part (>= 1).
export const PERK_INFO = Object.freeze({
  PACE: {
    name: 'Pace',
    summary: (up) =>
      `${up ? 'Bigger' : 'Smaller'} points for your running pace.`,
    sentence: (p, up) =>
      `The points you earn for your running pace are ${p}% ${up ? 'bigger' : 'smaller'}. They help you take land from rivals.`,
    example: (m) => `If your pace earns 20 points, you get ${fmt(20 * m)}.`,
    where: EFFORT_MODES,
  },
  BASE_EFFORT: {
    name: 'Distance',
    summary: (up) =>
      `${up ? 'Bigger' : 'Smaller'} points for every km you run.`,
    sentence: (p, up) =>
      `The points you earn for distance are ${p}% ${up ? 'bigger' : 'smaller'}, up to 10 km a run.`,
    example: (m) => `A 5 km run earns 10 points, so you get ${fmt(10 * m)}.`,
    where: EFFORT_MODES,
  },
  AREA: {
    name: 'Territory Area',
    summary: (up) =>
      `${up ? 'Bigger' : 'Smaller'} points for the land you claim.`,
    sentence: (p, up) =>
      `The points for the size of your loop are ${p}% ${up ? 'bigger' : 'smaller'}. Only closed loops count.`,
    example: (m) => `A loop worth 12 points counts as ${fmt(12 * m)}.`,
    where: LOOP_MODES,
  },
  PERIMETER_EFFICIENCY: {
    name: 'Loop Shape',
    summary: (up) =>
      `${up ? 'Bigger' : 'Smaller'} points for neat, round loops.`,
    sentence: (p, up) =>
      `Neat, round loops earn ${p}% ${up ? 'more' : 'fewer'} shape points. Only closed loops count.`,
    example: (m) => `A loop worth 30 shape points counts as ${fmt(30 * m)}.`,
    where: LOOP_MODES,
  },
  CLOSURE_PRECISION: {
    name: 'Loop Closing',
    summary: (up) =>
      `${up ? 'Bigger' : 'Smaller'} points for ending where you started.`,
    sentence: (p, up) =>
      `Ending close to your start earns ${p}% ${up ? 'more' : 'fewer'} closing points. Only closed loops count.`,
    example: (m) => `8 closing points count as ${fmt(8 * m)}.`,
    where: LOOP_MODES,
  },
  RACE_TIME: {
    name: 'Race Time',
    // Lower is better here, so a multiplier below 1 is the helpful one.
    summary: (up) => `Your PvP race time counts ${up ? 'longer' : 'shorter'}.`,
    sentence: (p, up) =>
      up
        ? `Your time in PvP races counts ${p}% longer.`
        : `Your time in PvP races counts ${p}% shorter, so you win more close races.`,
    example: (m) => `A 10:00 race counts as ${mmss(600 * m)}.`,
    where: [PERK_MODES.PVP],
  },
})

// What the popup shows for one ability ({ id, componentType, multiplier }).
// `all` is the hero's full ability list, to tell a hero's main perk from a
// weaker second one (which the server counts at half strength). Returns null
// for an ability without a multiplier or an unknown perk id.
export function describePerk(ability, all = []) {
  if (!ability || ability.multiplier == null) return null
  const info = PERK_INFO[ability.componentType]
  if (!info) return null
  const m = Number(ability.multiplier)
  const pct = Math.round(Math.abs(m - 1) * 100)
  // RACE_TIME helps when it is BELOW 1; every other perk helps above 1.
  const up = m >= 1
  const strength = (a) => Math.abs(Number(a.multiplier) - 1)
  const strongest = Math.max(0, ...all.map(strength))
  const isSecondary = all.length > 1 && strength(ability) < strongest
  return {
    id: ability.componentType,
    name: info.name,
    sign: up ? '+' : '−',
    pct,
    valueText: `${up ? '+' : '−'}${pct}%`,
    summary: info.summary(up),
    sentence: info.sentence(pct, up),
    example: info.example(m),
    where: info.where,
    note: isSecondary
      ? 'This is the hero’s second perk, so it works at half strength.'
      : null,
  }
}
