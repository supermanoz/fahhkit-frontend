// "Let's run" local notifications (native app only - see src/utils/reminders.js).
// Times are in the device's own local time, no server/timezone involved.
// Each slot rotates through its own 3 message variants by day-of-year, so
// the same slot doesn't say the exact same thing two days running.
export const REMINDER_SLOTS = [
  {
    id: 0,
    hour: 7,
    minute: 30,
    messages: [
      'Rise and run! 🌅 Claim some territory before the day starts.',
      'Good morning, conqueror ☀️ The streets won’t run themselves.',
      'Early bird gets the territory 🏙️ Lace up and go claim it.',
    ],
  },
  {
    id: 1,
    hour: 13,
    minute: 0,
    messages: [
      'Lunch break run? 🏃 Your streets are waiting.',
      'Midday miles 🔆 Sneak in a run before the afternoon gets busy.',
      'Territory doesn’t defend itself at lunch 🍔💨 Quick run?',
    ],
  },
  {
    id: 2,
    hour: 19,
    minute: 0,
    messages: [
      'Evening run time! 🌙 Defend your territory, let’s go!',
      'Sun’s going down 🌆 Your rivals are still running – are you?',
      'One more run before bed 🏃‍♀️ Keep your streets locked down.',
    ],
  },
]

export const REMINDER_NOTIFICATION_TITLE = 'Run Conquest'

// How many days ahead to keep scheduled at once - topped back up on every
// app open (see useReminders), so this doesn't need to cover more than a
// reasonable gap between opens.
export const REMINDER_WINDOW_DAYS = 14
