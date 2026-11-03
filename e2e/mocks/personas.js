// Seeded test users for e2e mocking - shapes checked directly against the
// backend DTOs (TerritoryProfileResponse, UserStoreItemResponse/
// StoreItemResponse, IndividualLeaderboardResponse - see
// ~/Documents/FahhKit, read-only, never edited) and against src/api/client.js
// (every success response is unwrapped as body.data, so every mock below
// gets wrapped the same way by mockApi.js, not here).

const USER_BASE = {
  userType: 'ATHLETE',
  profilePictureUrl: null,
}

function heroItem({ id, heroId, name, equipped = false }) {
  return {
    id,
    storeItem: {
      id: `storeitem-hero-${id}`,
      category: 'HERO',
      name,
      heroId,
      assetUrl: null,
      priceFahhcoin: 0,
    },
    equipped,
  }
}

function emoteItem({ id, heroId, name, equipped = false }) {
  return {
    id,
    storeItem: {
      id: `storeitem-emote-${id}`,
      category: 'EMOTE',
      name,
      heroId,
      assetUrl: null,
      priceFahhcoin: 100,
    },
    equipped,
  }
}

// veteran: Nova equipped + a real mapped emote (emote2, see Nova's own
// manifest.json) - the profile-popup tests check this one shows both the
// right hero AND the right emote, and that it's never what a DIFFERENT
// persona's profile shows.
export const VETERAN = {
  id: 'user-veteran',
  nickname: 'Vet',
  fullName: 'Veteran Runner',
  user: { ...USER_BASE, id: 'user-veteran', fullName: 'Veteran Runner' },
  territoryProfile: {
    userId: 'user-veteran',
    totalAreaSqMeters: 125_000,
    parcelCount: 12,
    level: 14,
    xp: 3400,
    fahhcoinBalance: 2500,
    medals: [],
    equippedCosmetics: [
      heroItem({
        id: 'owned-nova',
        heroId: 'hero-nova-id',
        name: 'Nova',
        equipped: true,
      }),
      emoteItem({
        id: 'owned-nova-emote2',
        heroId: 'hero-nova-id',
        name: 'Emote2',
        equipped: true,
      }),
    ],
    showcasedMedals: [],
    clubName: 'Night Owls',
    clubRole: 'MEMBER',
  },
  ownedItems: [
    heroItem({
      id: 'owned-nova',
      heroId: 'hero-nova-id',
      name: 'Nova',
      equipped: true,
    }),
    emoteItem({
      id: 'owned-nova-emote2',
      heroId: 'hero-nova-id',
      name: 'Emote2',
      equipped: true,
    }),
  ],
}

// A second, distinct persona - Blaze idle, no emote - specifically for the
// "no cross-user leakage" check (open veteran, then this one, confirm the
// hero/emote actually changes and the veteran's emote doesn't linger).
export const BLAZE_IDLE = {
  id: 'user-blaze-idle',
  nickname: 'Blazer',
  fullName: 'Blaze Idle',
  user: { ...USER_BASE, id: 'user-blaze-idle', fullName: 'Blaze Idle' },
  territoryProfile: {
    userId: 'user-blaze-idle',
    totalAreaSqMeters: 40_000,
    parcelCount: 4,
    level: 6,
    xp: 800,
    fahhcoinBalance: 300,
    medals: [],
    equippedCosmetics: [
      heroItem({
        id: 'owned-blaze',
        heroId: 'hero-blaze-id',
        name: 'Blaze',
        equipped: true,
      }),
    ],
    showcasedMedals: [],
    clubName: null,
    clubRole: null,
  },
  ownedItems: [
    heroItem({
      id: 'owned-blaze',
      heroId: 'hero-blaze-id',
      name: 'Blaze',
      equipped: true,
    }),
  ],
}

// new: no hero equipped at all, no club, no territory yet - "never blank"
// fallback coverage (DEFAULT_HERO, idle, no club section, no crash).
export const NEW_USER = {
  id: 'user-new',
  nickname: null,
  fullName: 'Brand New',
  user: { ...USER_BASE, id: 'user-new', fullName: 'Brand New' },
  territoryProfile: {
    userId: 'user-new',
    totalAreaSqMeters: 0,
    parcelCount: 0,
    level: 1,
    xp: 0,
    fahhcoinBalance: 0,
    medals: [],
    equippedCosmetics: [],
    showcasedMedals: [],
    clubName: null,
    clubRole: null,
  },
  ownedItems: [],
}

// club captain - same shape as veteran, different role, for Club War /
// club-management entry points.
export const CAPTAIN = {
  id: 'user-captain',
  nickname: 'Cap',
  fullName: 'Club Captain',
  user: { ...USER_BASE, id: 'user-captain', fullName: 'Club Captain' },
  territoryProfile: {
    userId: 'user-captain',
    totalAreaSqMeters: 300_000,
    parcelCount: 30,
    level: 22,
    xp: 9000,
    fahhcoinBalance: 5000,
    medals: [],
    equippedCosmetics: [
      heroItem({
        id: 'owned-cyclone',
        heroId: 'hero-cyclone-id',
        name: 'Cyclone',
        equipped: true,
      }),
    ],
    showcasedMedals: [],
    clubName: 'Night Owls',
    clubRole: 'CAPTAIN',
  },
  ownedItems: [
    heroItem({
      id: 'owned-cyclone',
      heroId: 'hero-cyclone-id',
      name: 'Cyclone',
      equipped: true,
    }),
  ],
}

export const STORE_CATALOG = [
  {
    id: 'storeitem-hero-nova',
    category: 'HERO',
    name: 'Nova',
    heroId: 'hero-nova-id',
    priceFahhcoin: 0,
    assetUrl: null,
  },
  {
    id: 'storeitem-hero-blaze',
    category: 'HERO',
    name: 'Blaze',
    heroId: 'hero-blaze-id',
    priceFahhcoin: 0,
    assetUrl: null,
  },
  {
    id: 'storeitem-hero-cyclone',
    category: 'HERO',
    name: 'Cyclone',
    heroId: 'hero-cyclone-id',
    priceFahhcoin: 0,
    assetUrl: null,
  },
  {
    id: 'storeitem-emote-nova-2',
    category: 'EMOTE',
    name: 'Emote2',
    heroId: 'hero-nova-id',
    priceFahhcoin: 100,
    assetUrl: null,
  },
]

export const INDIVIDUAL_LEADERBOARD = [
  {
    rank: 1,
    userId: VETERAN.id,
    fullName: VETERAN.fullName,
    areaSqMeters: 125_000,
    countryName: 'Testland',
    cityName: 'Test City',
  },
  {
    rank: 2,
    userId: CAPTAIN.id,
    fullName: CAPTAIN.fullName,
    areaSqMeters: 300_000,
    countryName: 'Testland',
    cityName: 'Test City',
  },
  {
    rank: 3,
    userId: BLAZE_IDLE.id,
    fullName: BLAZE_IDLE.fullName,
    areaSqMeters: 40_000,
    countryName: 'Testland',
    cityName: 'Test City',
  },
  {
    rank: 4,
    userId: NEW_USER.id,
    fullName: NEW_USER.fullName,
    areaSqMeters: 0,
    countryName: 'Testland',
    cityName: 'Test City',
  },
]

export const CLUB_LEADERBOARD = [
  {
    rank: 1,
    clubId: 'club-night-owls',
    clubName: 'Night Owls',
    trophies: 4200,
  },
]
