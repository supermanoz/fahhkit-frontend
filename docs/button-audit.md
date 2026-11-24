# Button audit (shared GameButton migration)

One component now: `src/components/ui/GameButton.jsx` (+ `.css`). Preview: `/dev/buttons` (dev server only).

Variants: `primary` (green), `accent` (slate, Leaderboard), `gold`, `danger` (red), `neutral` (cream), `tab` (segmented, `selected`), `iconOnly` (round). Sizes `sm|md|lg`, `fullWidth`, `icon`, `loading`, `disabled`, `as`/`href`.

## Per file: GameButton usages vs. raw `<button>` still left

| File                                              | GameButton | raw `<button>` left |
| ------------------------------------------------- | ---------- | ------------------- |
| pages/GamePage.jsx                                | 41         | 38                  |
| pages/FraudFlagsPage.jsx                          | 0          | 12                  |
| components/HeroDetailModal.jsx                    | 1          | 11                  |
| components/PvpPanel.jsx                           | 17         | 10                  |
| components/TrackRunPanel.jsx                      | 0          | 10                  |
| pages/EventRegistrantsPage.jsx                    | 0          | 10                  |
| components/HeroAdminPanel.jsx                     | 0          | 7                   |
| pages/GameMechanicsPage.jsx                       | 0          | 7                   |
| components/HeroGallery.jsx                        | 0          | 6                   |
| components/ClubWarHistory.jsx                     | 2          | 5                   |
| components/MailPanel.jsx                          | 3          | 5                   |
| components/SponsorBannerAdminPanel.jsx            | 0          | 5                   |
| components/game-auth/GameSignUpScreen.jsx         | 3          | 5                   |
| components/ClubWarHeroPicker.jsx                  | 0          | 4                   |
| components/MailToolsPanel.jsx                     | 0          | 4                   |
| components/Navbar.jsx                             | 0          | 4                   |
| components/SearchFilters.jsx                      | 0          | 4                   |
| components/ShareRunCarousel.jsx                   | 0          | 4                   |
| components/SponsorBannerCarousel.jsx              | 0          | 4                   |
| pages/EventDetailPage.jsx                         | 0          | 4                   |
| pages/EventsPage.jsx                              | 0          | 4                   |
| pages/ShopPage.jsx                                | 0          | 4                   |
| components/BroadcastPrompt.jsx                    | 2          | 3                   |
| components/Carousel.jsx                           | 0          | 3                   |
| components/ClubPanel.jsx                          | 16         | 3                   |
| components/GameSettings.jsx                       | 2          | 3                   |
| components/LeaderboardPodium.jsx                  | 0          | 3                   |
| components/NotificationsSection.jsx               | 0          | 3                   |
| components/TeamCarousel.jsx                       | 0          | 3                   |
| pages/EditProfilePage.jsx                         | 0          | 3                   |
| pages/SponsorReportPage.jsx                       | 0          | 3                   |
| components/AppleSignInButton.jsx                  | 0          | 2                   |
| components/ClubWarPanel.jsx                       | 8          | 2                   |
| components/IdleNudge.jsx                          | 0          | 2                   |
| components/MapStylePicker.jsx                     | 0          | 2                   |
| components/ProfileAvatar.jsx                      | 0          | 2                   |
| components/RunRewardsModal.jsx                    | 2          | 2                   |
| components/game-auth/GameSignInScreen.jsx         | 1          | 2                   |
| pages/AthleteSearchPage.jsx                       | 0          | 2                   |
| pages/EditAthletePage.jsx                         | 0          | 2                   |
| pages/EditModeratorPage.jsx                       | 0          | 2                   |
| pages/EventReportPage.jsx                         | 0          | 2                   |
| pages/PaymentStatusPage.jsx                       | 0          | 2                   |
| components/AthleteTerritoryProfilePanel.jsx       | 2          | 1                   |
| components/ChallengePrompt.jsx                    | 2          | 1                   |
| components/ColorShelf.jsx                         | 0          | 1                   |
| components/DailyChest.jsx                         | 0          | 1                   |
| components/DailyRewardModal.jsx                   | 3          | 1                   |
| components/EmoteAdminPanel.jsx                    | 0          | 1                   |
| components/EmoteShowcase.jsx                      | 4          | 1                   |
| components/ExportButton.jsx                       | 0          | 1                   |
| components/GameTour.jsx                           | 4          | 1                   |
| components/GoogleSignInButton.jsx                 | 0          | 1                   |
| components/LiveEventRunPrompt.jsx                 | 0          | 1                   |
| components/MailDetail.jsx                         | 3          | 1                   |
| components/MapAttribution.jsx                     | 0          | 1                   |
| components/OfflineOverlay.jsx                     | 0          | 1                   |
| components/PasswordField.jsx                      | 0          | 1                   |
| components/PrizeInfoPopup.jsx                     | 0          | 1                   |
| components/RouteTurnIndicator.jsx                 | 0          | 1                   |
| components/SeasonBanner.jsx                       | 0          | 1                   |
| components/SeasonPrizeModal.jsx                   | 0          | 1                   |
| components/SettingsParts.jsx                      | 0          | 1                   |
| components/TerritoryMap.jsx                       | 0          | 1                   |
| components/ThemeToggle.jsx                        | 0          | 1                   |
| components/VehicleAlert.jsx                       | 0          | 1                   |
| components/WelcomeBonusModal.jsx                  | 1          | 1                   |
| components/game-auth/AuthParts.jsx                | 0          | 1                   |
| components/game-auth/GameForgotPasswordScreen.jsx | 3          | 1                   |
| components/game-auth/GameSetPasswordScreen.jsx    | 2          | 1                   |
| components/game-legal/GameLegalModal.jsx          | 0          | 1                   |
| components/pvp/PvpParts.jsx                       | 0          | 1                   |
| components/shop/ColorItemSheet.jsx                | 6          | 1                   |
| game/ui/CurrencyPill.jsx                          | 0          | 1                   |
| game/ui/Misc.jsx                                  | 0          | 1                   |
| game/ui/Panel.jsx                                 | 0          | 1                   |
| game/ui/Tabs.jsx                                  | 0          | 1                   |
| game/ui/VolumeSlider.jsx                          | 0          | 1                   |
| pages/ContactPage.jsx                             | 0          | 1                   |
| pages/CreateEventPage.jsx                         | 0          | 1                   |
| pages/CreateModeratorPage.jsx                     | 0          | 1                   |
| pages/EditEventPage.jsx                           | 0          | 1                   |
| pages/ForgotPasswordPage.jsx                      | 0          | 1                   |
| pages/GameLegalPage.jsx                           | 0          | 1                   |
| pages/LoginPage.jsx                               | 0          | 1                   |
| pages/RegisterPage.jsx                            | 0          | 1                   |
| pages/RunDetailPage.jsx                           | 0          | 1                   |
| pages/UpdatePasswordPage.jsx                      | 0          | 1                   |
| components/ClubStates.jsx                         | 1          | 0                   |
| components/MailStates.jsx                         | 1          | 0                   |
| components/NicknameCard.jsx                       | 1          | 0                   |
| components/RolloutRequestModal.jsx                | 1          | 0                   |
| components/RunResultCard.jsx                      | 2          | 0                   |
| components/game-auth/GameWelcomeScreen.jsx        | 2          | 0                   |
| components/pvp/PvpGatePrompt.jsx                  | 3          | 0                   |
| pages/DevButtonsPage.jsx                          | 13         | 0                   |

## Left on purpose (not migrated)

- **Website / admin pages** (`pages/*Page.jsx` other than game ones, `HeroAdminPanel`, `SponsorBannerAdminPanel`, `MailToolsPanel`, `EmoteAdminPanel`, `TrackRunPanel`, `Navbar`, `SearchFilters`, `ExportButton`, `ShareRunCarousel`): they use the website `.btn` system, not the game look. Separate pass if wanted.
- **Round close X (`.game-close-btn`, 13 uses)**: already one shared red-circle class; not yet folded into `GameButton iconOnly`.
- **Tabs/segmented rows** (`.game-menu-subtab`, `.g-tab`, `.pvp-*` option cards, shop/club tab bars) and **icon buttons** (HUD, GPS, gear, `.g-icon-btn`): bespoke per-screen CSS, not yet moved to `variant="tab"` / `iconOnly`.
- **Per-screen buttons with their own classes** (`hero-action-btn`, `club-leave-btn`, `pvp-step-btn`, `mail-delete-btn`, `set-logout-btn`, `shop-buy-btn`, `idle-nudge-go/later`, `game-tour-skip`, `game-auth-link/back`): link-style or bespoke; not yet migrated.
- **Google / Apple sign-in**: brand buttons, untouched.
- **`VehicleAlert`**: shared with the website `.btn` system, untouched.
