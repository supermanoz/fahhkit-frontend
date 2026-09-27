import { postJson } from './client'

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
