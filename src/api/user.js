import { getJson, postJson } from './client'

// Logged-in user's own profile (UserController in the FahhKit backend).

// Server rule (SelfProfileUpdateRequest): 3-20 letters, digits or
// underscores, unique (case-insensitive). Mirrored here for instant
// feedback; the server still has the final say (e.g. "already taken").
export const NICKNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

// edit-profile is a partial update - only the fields sent change.
// Returns the updated UserResponse.
export function setNickname(nickname) {
  return postJson('/v1/user/edit-profile', { nickname })
}

// Exact (case-insensitive) nickname lookup - any player, not just ones on
// the leaderboard. Returns { id, nickname, fullName, profilePictureUrl },
// or null when nobody has that nickname (the server answers "user doesn't
// exist" with an error, which is swallowed here).
export async function findPlayerByNickname(nickname) {
  try {
    return await getJson(
      `/v1/user/search-by-nickname?nickname=${encodeURIComponent(nickname)}`
    )
  } catch {
    return null
  }
}
