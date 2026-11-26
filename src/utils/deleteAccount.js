// In-app account deletion (App Store guideline 5.1.1(v)). The call is
// DELETE /v1/user/me (api/user.js deleteMyAccount); this file holds what the
// confirm dialog tells the player first - what is removed and that it cannot
// be undone - and the friendly error line.
export const DELETE_ACCOUNT_COPY = Object.freeze({
  title: 'Delete your account?',
  intro:
    'This permanently deletes your Run Conquest account. It cannot be undone.',
  deletes: Object.freeze([
    'Your profile, name and nickname',
    'Your runs, stats, XP and level',
    'Your territories and club membership',
    'Your Fahhcoin, heroes and purchases in the game',
  ]),
  note: 'Runs saved on this phone that have not uploaded yet will not count. If you signed in with Apple, you can also remove the app under Apple ID settings.',
  action: 'Delete account',
  working: 'Deleting…',
  keep: 'Keep account',
  failed: "We couldn't delete your account. Please try again.",
})
