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
  `${what} apply to Run Conquest, the running game made by ${GAME_OPERATOR} ("we", "us"), a company in Nepal. By creating an account or playing, you accept them.`

export const GAME_LEGAL_DOCS = {
  terms: {
    title: 'Terms & Conditions',
    intro: intro('These terms'),
    sections: [
      {
        id: 'eligibility',
        title: 'Who can play',
        paras: [
          `You must be at least ${GAME_MIN_AGE} years old to create an account (the sign-up form checks your date of birth). [CHECK: app stores and children's-privacy laws often expect 13+; confirm ${GAME_MIN_AGE} is what you want.]`,
          'If you are under 18, a parent or guardian must agree to these terms for you and be happy for you to run outdoors. [CHECK: consent wording under Nepali law.]',
        ],
      },
      {
        id: 'account',
        title: 'Your account',
        list: [
          'One account per person.',
          'Give us true details (name, email, mobile, date of birth) and keep them up to date.',
          'Do not share or sell your account. You are responsible for what happens on it.',
          'Tell us right away if you think someone else got in.',
        ],
      },
      {
        id: 'fair-play',
        title: 'Gameplay and fair play',
        paras: ['Play it for real. You must not:'],
        list: [
          'fake your location (GPS spoofing, mock-location apps),',
          'run or conquer from a vehicle, bike, scooter or any motor,',
          'use emulators, rooted or tampered devices, bots or scripts,',
          'exploit bugs, or help anyone else cheat.',
        ],
        after:
          'If we find cheating, we can remove runs, reset your territory, coins or score, or suspend or ban your account, with or without notice. Territory and scores belong to the game, not to you, and can be reset (for example at a season change).',
      },
      {
        id: 'fahhcoin',
        title: 'Fahhcoin and purchases',
        list: [
          'Fahhcoin is virtual game currency. It has no cash value, cannot be sold, traded or transferred, and cannot be exchanged for money.',
          'Coins and items are paid for in Nepali rupees (NPR) through Khalti. The price is shown before you pay.',
          'Purchases are final. We refund only where the law or Khalti requires it. [CHECK: refund policy.]',
          `If a payment fails or you are charged without receiving coins, contact ${GAME_CONTACT_EMAIL} with your account and payment details and we will sort it out.`,
          'If your account is closed for breaking these terms, unused Fahhcoin and items are lost.',
        ],
      },
      {
        id: 'safety',
        title: 'Safety while running',
        paras: [
          'You run at your own risk. Check that you are healthy enough to run, watch your surroundings, follow traffic laws, stay out of private or unsafe places, and never look at your phone while crossing a road.',
          'Routes, territories and prompts in the game are only suggestions. To the extent the law allows, we are not responsible for injury, loss or damage that happens while you play.',
        ],
      },
      {
        id: 'location',
        title: 'Location',
        paras: [
          'The game needs your location to work. During a run it can keep tracking in the background so your route is recorded with the screen off.',
          'You can stop this at any time: end the run, switch location permission off in your phone settings, or log out. The game then cannot track runs or capture territory. See the Privacy Policy for details.',
        ],
      },
      {
        id: 'content',
        title: 'Names, photos and clubs',
        paras: [
          'Your display name, profile photo and club names are visible to other players. Do not use anything abusive, hateful, sexual, misleading, or that belongs to someone else. We may remove or change content and act on the account.',
        ],
      },
      {
        id: 'partners',
        title: 'Sponsors, partners and prizes',
        paras: [
          'Banners and offers from sponsors and partners are from those third parties, not from us, and we do not control their sites or products.',
          'Season prizes follow separate rules announced for that season. [CHECK: link to the prize rules.]',
        ],
      },
      {
        id: 'changes-service',
        title: 'Changes to the game and ending your account',
        paras: [
          'We may change, pause or stop parts of the game, or the whole game, at any time. We try to give notice when we can.',
          `You can stop playing whenever you like. To close your account, email ${GAME_CONTACT_EMAIL}. We may suspend or close accounts that break these terms.`,
        ],
      },
      {
        id: 'liability',
        title: 'Limit of our liability',
        paras: [
          'The game is provided "as is". To the extent the law allows, we are not liable for indirect or consequential loss, lost progress, or downtime, and our total liability for any claim is limited to the amount you paid us in the 12 months before it. Nothing here limits liability that cannot legally be limited. [CHECK: with your lawyer.]',
        ],
      },
      {
        id: 'law',
        title: 'Governing law',
        paras: [
          'These terms are governed by the laws of Nepal, and the courts of Nepal can hear any dispute. [CHECK: city/court.]',
        ],
      },
      {
        id: 'changes-terms',
        title: 'Changes to these terms',
        paras: [
          'We may update these terms. The "Last updated" date above shows the latest version. If you keep playing after a change, you accept the new version. For big changes we will tell you in the game or by email.',
        ],
      },
      {
        id: 'contact',
        title: 'Contact',
        paras: [`${GAME_OPERATOR}, Nepal. Email: ${GAME_CONTACT_EMAIL}`],
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
        list: [
          'Account details: name, email, mobile number, date of birth, country (and gender and address as stored on your account).',
          'Location: GPS points from your runs, including in the background while a run is active, and your last known position for features such as nearby territory and challenges.',
          'Run data: routes, distance, time, territory captured, scores and rewards.',
          'Device token: so we can send push notifications (via Firebase) to your phone.',
          'Purchase records: Fahhcoin and item purchases, amounts and payment references (we do not see or store your Khalti login or card details).',
          'Profile photo and the name you choose to show, club membership, and anything you send to support.',
          'Basic technical data such as device type and error logs. [CHECK: any analytics you add.]',
        ],
      },
      {
        id: 'why',
        title: 'Why we use it',
        list: [
          'To create your account and let you log in.',
          'To run the game: record runs, capture territory, show leaderboards, clubs and events.',
          'To process purchases and give you what you bought.',
          'To send notifications you allow (run reminders, game alerts).',
          'To keep the game fair and safe: spot cheating and abuse.',
          'To answer support requests and improve the game.',
        ],
        after: 'We do not sell your personal data.',
      },
      {
        id: 'share',
        title: 'Who we share it with',
        list: [
          'Hosting and database providers that run our servers. [CHECK: provider names and country.]',
          'Firebase (Google) to deliver push notifications.',
          'Khalti to process payments.',
          'Map tiles come from OpenFreeMap / OpenStreetMap; loading the map sends your device’s IP address and the area you view to them.',
          'Other players see your display name, photo, level, club and the territory you own. Your exact live location is not shown to other players. [CHECK: confirm this matches the game.]',
          'Authorities, when the law requires it.',
        ],
      },
      {
        id: 'retention',
        title: 'How long we keep it',
        paras: [
          'We keep your data while your account is active. After you ask us to delete it, we remove or anonymise it, except records we must keep (for example payment records and fair-play logs). [CHECK: exact retention periods.]',
        ],
      },
      {
        id: 'delete',
        title: 'Deleting your account and data',
        paras: [
          `There is no in-app delete button yet. Email ${GAME_CONTACT_EMAIL} from the address on your account, tell us to delete your account, and we will do it and confirm. [CHECK: response time you commit to.]`,
          'You can also turn off location and notification permissions at any time in your phone settings.',
        ],
      },
      {
        id: 'children',
        title: 'Children',
        paras: [
          `The game is for players aged ${GAME_MIN_AGE} and over. If you are under 18, a parent or guardian should agree to this policy with you. We do not knowingly collect data from younger children; if you think we have, email ${GAME_CONTACT_EMAIL} and we will delete it. [CHECK: age limit.]`,
        ],
      },
      {
        id: 'rights',
        title: 'Your rights',
        paras: [
          `You can ask to see, correct or delete the personal data we hold about you, to object to some uses, or to withdraw consent (for example for location or notifications) by emailing ${GAME_CONTACT_EMAIL}. [CHECK: Nepal privacy law wording; add GDPR wording if you serve EU players.]`,
        ],
      },
      {
        id: 'security',
        title: 'Security',
        paras: [
          'We use reasonable measures to protect your data, but no system is perfectly secure.',
        ],
      },
      {
        id: 'changes',
        title: 'Changes to this policy',
        paras: [
          'We may update this policy. The "Last updated" date above shows the latest version, and we will tell you in the game for important changes.',
        ],
      },
      {
        id: 'contact',
        title: 'Contact',
        paras: [`${GAME_OPERATOR}, Nepal. Email: ${GAME_CONTACT_EMAIL}`],
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
