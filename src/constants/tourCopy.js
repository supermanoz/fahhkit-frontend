// First-time walkthrough ("coach marks") copy - ONE place to edit it, keyed by
// step id (the ids and their order live in utils/tour.js). Plain words, max
// two short sentences per step. Every claim below was checked against the
// code (see the notes), so edit with care:
//
//  - training: the app never judges a Training run as territory
//    (utils/postRun.js isTerritoryMode) and it can be paused. We do NOT say
//    "no land" - the backend still processes it like a Conquer run.
//  - conquer: only a closed loop is evaluated for territory.
//  - pvp: the fastest runner takes the pot (PvpPanel); starting a NEW match
//    needs Visibility on (utils/pvpEntry.js resolveMatchStart).

export const TOUR_COPY = Object.freeze({
  welcome: {
    title: 'Welcome!',
    body: 'Welcome to Run Conquest! Run in real life to claim the streets around you.',
  },
  hero: {
    title: 'This is you',
    body: 'This is you. Tap the target button, bottom right, if you lose yourself on the map.',
  },
  play: {
    title: 'Play',
    // No intro line: the three cards ARE the message, and the card has to fit
    // above the button on a 640px-tall phone.
    body: '',
    modes: [
      {
        id: 'training',
        name: 'Training',
        line: 'A relaxed run you can pause. Earns XP.',
      },
      {
        id: 'conquer',
        name: 'Conquer',
        line: 'Run a loop and close it to claim territory.',
      },
      {
        id: 'pvp',
        name: 'PvP',
        line: 'Race a real runner. Fastest time takes the coins. Needs Visibility on.',
      },
    ],
  },
  mail: {
    title: 'Mail',
    body: 'News and messages from us.',
  },
  shop: {
    title: 'Shop',
    body: 'Spend coins on heroes, flags and trails.',
  },
  me: {
    title: 'Me',
    body: 'Your profile, hero, run history and stats. Leaderboard and Club show top runners and your team.',
  },
  done: {
    title: 'Ready?',
    body: 'Ready? Start with a Training run.',
  },
})

export const TOUR_ACTIONS = Object.freeze({
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  startTraining: 'Start Training',
  explore: 'Explore on my own',
  // Settings row that replays the tour.
  howToPlay: 'How to play',
  howToPlaySub: 'Replay the quick tour',
})

export const tourStepLabel = (index, count) => `Step ${index + 1} of ${count}`
