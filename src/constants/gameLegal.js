// Run Conquest (the /game app) Terms & Conditions and Privacy Policy.
// SEPARATE from the website's FahhKit terms (constants/terms.js, /terms/:type),
// which stay as they are. Rendered by components/game-legal/*.
//
// Anything the operator must confirm is marked [CHECK ...] (shown highlighted
// in the page) and the contact address is the [CONTACT EMAIL] placeholder.
// Bump GAME_TERMS_VERSION whenever either document changes materially: it is
// what the sign-up screen records as "accepted".

export const GAME_TERMS_VERSION = '2026-11-15'
export const GAME_LEGAL_LAST_UPDATED = '15 November 2026'
export const GAME_OPERATOR = 'Everest Solutions Digital Tech Pvt. Ltd.'
export const GAME_CONTACT_EMAIL = '[CONTACT EMAIL]'
// The minimum age the sign-up DOB check enforces (GameSignUpScreen.jsx
// MIN_AGE_YEARS, backend @MinimumAge(10) on AthleteSignupRequest).
export const GAME_MIN_AGE = 10

const intro = (what) =>
  `${what} apply to Run Conquest, made by ${GAME_OPERATOR}, Nepal. By playing, you accept them.`

export const GAME_LEGAL_DOCS = {
  terms: {
    title: 'Terms & Conditions',
    intro: intro('These terms'),
    sections: [
      {
        id: 'age',
        title: 'Who can play',
        paras: [
          `You must be ${GAME_MIN_AGE} or older. Under 18s need a parent or guardian's OK. [CHECK: age; stores often expect 13+.]`,
        ],
      },
      {
        id: 'account',
        title: 'Your account',
        paras: [
          'One account per person, with true details. Do not share it. You are responsible for what happens on it.',
        ],
      },
      {
        id: 'fair-play',
        title: 'Fair play',
        paras: [
          'No GPS spoofing, vehicles, emulators, bots or bug abuse. We may remove runs, reset territory or scores, or ban accounts that cheat.',
        ],
      },
      {
        id: 'fahhcoin',
        title: 'Fahhcoin and payments',
        paras: [
          'Fahhcoin is virtual currency with no cash value and cannot be transferred. You pay in NPR through Khalti, and the price is shown first. Purchases are final except where the law or Khalti requires a refund. [CHECK: refund policy.]',
        ],
      },
      {
        id: 'risk',
        title: 'Run at your own risk',
        paras: [
          'Obey traffic laws and watch your surroundings. Routes are only suggestions. We are not liable for injury or loss while you play, as far as the law allows.',
        ],
      },
      {
        id: 'location',
        title: 'Location',
        paras: [
          'The game needs your location, including in the background during a run. Turn it off in your phone settings or end the run to stop it.',
        ],
      },
      {
        id: 'changes',
        title: 'Ending and changes',
        paras: [
          `We may change the game or these terms, or suspend accounts that break them. To close your account, email ${GAME_CONTACT_EMAIL}.`,
        ],
      },
      {
        id: 'law',
        title: 'Nepal law',
        paras: ['These terms follow the laws of Nepal.'],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    intro: intro('This policy'),
    sections: [
      {
        id: 'collect',
        title: 'What we collect',
        paras: [
          'Name, date of birth, mobile number and email; your location during runs; your push notification token; purchase records; and your profile photo.',
        ],
      },
      {
        id: 'why',
        title: 'Why',
        paras: [
          'To run your account, record runs and territory, send notifications, process purchases and keep the game fair. We never sell your data.',
        ],
      },
      {
        id: 'share',
        title: 'Who we share it with',
        paras: [
          'Hosting providers, Firebase (push notifications), Khalti (payments) and map providers (OpenFreeMap / OpenStreetMap). Other players see your name, photo and territory. [CHECK: hosting provider.]',
        ],
      },
      {
        id: 'keep',
        title: 'How long we keep it',
        paras: [
          'While your account is active, then deleted or anonymised, except records we must keep by law. [CHECK: retention period.]',
        ],
      },
      {
        id: 'delete',
        title: 'Delete your account',
        paras: [
          `Email ${GAME_CONTACT_EMAIL} from your account email and we will delete your account and data. You can also see, correct or ask about your data this way.`,
        ],
      },
      {
        id: 'children',
        title: 'Children',
        paras: [
          `For players ${GAME_MIN_AGE}+; under 18s need a parent or guardian's OK. Email us if a child's data should be removed.`,
        ],
      },
    ],
  },
}

// Every [CHECK ...] marker, for the report / a pre-launch checklist.
export function listCheckItems() {
  const out = []
  for (const [key, doc] of Object.entries(GAME_LEGAL_DOCS)) {
    for (const s of doc.sections) {
      const texts = [...(s.paras || []), ...(s.list || []), s.after || '']
      for (const t of texts) {
        for (const m of t.matchAll(/\[CHECK[^\]]*\]/g))
          out.push(`${key} / ${s.title}: ${m[0]}`)
      }
    }
  }
  return out
}
