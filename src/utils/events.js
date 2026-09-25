export const EVENT_TYPE_LABELS = {
  ENDURANCE: 'Endurance',
  STRENGTH: 'Strength',
  HYBRID: 'Hybrid',
  GYMNASTICS: 'Gymnastics',
  COMBAT: 'Combat',
  TEAM: 'Team',
  RACKET: 'Racket',
  OUTDOOR: 'Outdoor',
  FLEXIBILITY: 'Flexibility',
  PHYSIQUE: 'Physique',
  RECREATIONAL: 'Recreational',
  RAID: 'Raid',
}

export function formatDate(value) {
  if (!value) return 'TBA'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// Mirrors the backend's validateEventOpenForRegistration: registration
// closes at the explicit deadline if one is set, otherwise at the event's
// own start time.
export function isRegistrationClosed(event) {
  if (!event) return false
  const cutoff = event.registrationDeadline || event.date
  return Boolean(cutoff) && new Date(cutoff) < new Date()
}
