import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Keeps the 2026-11-07 profanity cleanup (mapAmbience.js's weather hype
// lines, IdleNudge.jsx's nudge copy, LandingPage.jsx's "say fk it" branding,
// TrackRunPanel.jsx/GamePage.jsx's save-error copy) from quietly regressing.
// Scans every real source/text file under src/ and public/ (never
// node_modules/dist/build output, and never this file itself - see below)
// against a word-boundary blocklist, so a new line of game copy can't
// reintroduce one of these without a test failing.
const THIS_FILE = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..')
const SCAN_DIRS = ['src', 'public']
const SCAN_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.css',
  '.html',
  '.md',
])
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-app',
  'build',
  '.git',
])

// Whole-word/variant patterns, not raw substrings - \b keeps "class",
// "pass", "assets", "classic", "password", "bypass" etc. from ever
// tripping this.
const BLOCKLIST = [
  /\bfk\b/i,
  /\bfuk\b/i,
  /\bfuck\b/i,
  /\bfck\b/i,
  /\bfkin\b/i,
  /\bfking\b/i,
  /\bfkn\b/i,
  /\bwtf\b/i,
  /\bshit\b/i,
  /\bdamn\b/i,
  /\bass\b/i,
  /\bbitch\b/i,
  /f\*ck/i,
  /sh\*t/i,
]

// A specific (file suffix, line substring) pair that's a known-safe false
// positive - add an entry with a one-line reason here instead of loosening
// a pattern above, so the blocklist stays strict for everything else.
const ALLOWLIST = []

function isAllowlisted(filePath, lineText) {
  return ALLOWLIST.some(
    (entry) =>
      filePath.endsWith(entry.file) && lineText.includes(entry.contains)
  )
}

function collectFiles(dir, files = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files // dir doesn't exist - nothing to scan
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      collectFiles(full, files)
    } else if (SCAN_EXTENSIONS.has(path.extname(name))) {
      files.push(full)
    }
  }
  return files
}

describe('profanity guard', () => {
  it('src/ and public/ contain no blocklisted words outside the allowlist', () => {
    const files = SCAN_DIRS.flatMap((dir) =>
      collectFiles(path.join(ROOT, dir))
    ).filter((file) => file !== THIS_FILE)

    const hits = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((lineText, i) => {
        const pattern = BLOCKLIST.find((p) => p.test(lineText))
        if (pattern && !isAllowlisted(file, lineText)) {
          hits.push(
            `${path.relative(ROOT, file)}:${i + 1} (matched ${pattern}): ${lineText.trim()}`
          )
        }
      })
    }

    expect(hits, `Blocklisted word(s) found:\n${hits.join('\n')}`).toEqual([])
  })
})
