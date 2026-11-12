// The one shared playback pace for every sprite-sheet animation in the
// app - hero idle turntables and every emote alike (see
// components/AnimatedSprite.jsx, the one player every one of them renders
// through). The loop's length comes from each sequence's own frame count
// alone at this one pace (idle's 48 frames, a short gesture's 21, a long
// dance's up to 405 - see scripts/audit_source_frames.py) - never
// stretched or squeezed to fit a fixed duration, and never a per-emote
// override: if a given sequence still reads wrong, it's this one number
// that's off for every sequence, not that one's own special case.
//
// 24fps is the real export rate of the source render, not a guess -
// confirmed from the PNGs' own embedded Blender timecode metadata
// (frame 24 of every idle/emote sequence, every hero, rolls the embedded
// "Time" field's frame-digits over from :23 to :00 and bumps the seconds
// digit - i.e. the render's own frame-24-per-second boundary - see
// scripts/build_emote_sheets.py's header for how this was found). Kept as
// an exact fraction (not rounded to a whole ms) so 365 frames played back
// takes exactly 365/24s, not a value that's crept off by a rounding error
// accumulated frame over frame.
export const SPRITE_FPS = 24
export const SPRITE_FRAME_MS = 1000 / SPRITE_FPS
