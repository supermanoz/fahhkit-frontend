// Guards the outlined-text convention documented in tokens.css ("Outlined-text
// convention"): the game's white-with-black-outline text style is only for dark
// or busy backgrounds. Dark text with that outline on a light panel smears into
// a blur (the Mail popup bug), so these checks fail the build if someone:
//   1. gives text a stroke while setting a DARK colour, or putting the stroke
//      on a LIGHT background;
//   2. adds a new light popup/dialog/toast/sheet surface without adding it to
//      the opt-out list in tokens.css.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return cssFiles(full)
    return e.name.endsWith('.css') ? [full] : []
  })
}

function parse(file) {
  return postcss.parse(fs.readFileSync(file, 'utf8'))
}

function ownDecls(rule) {
  const out = {}
  rule.each((n) => {
    if (n.type === 'decl') out[n.prop] = n.value.replace(/\s+/g, ' ').trim()
  })
  return out
}

const LIGHT_BG =
  /(#fff\b|#ffffff|#fbf7ee|#fffdf8|#faf8f2|#f6f5ef|var\(--white\)|var\(--cream|var\(--row|var\(--game-panel\)|var\(--panel\))/i
const DARK_NAME = /(ink|dark|navy|brown|black)/i
const LIGHT_NAME = /(white|cream|light|text-title\)|game-text)/i

function isDarkColor(value) {
  if (!value) return false
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 115
  }
  if (/^var\(/.test(value))
    return DARK_NAME.test(value) && !LIGHT_NAME.test(value)
  return false
}

const hasStroke = (d) => {
  const v = d['-webkit-text-stroke'] ?? d['-webkit-text-stroke-width']
  return Boolean(v) && !/^(0|0px|none|inherit|revert|unset)\b/.test(v)
}

describe('outlined text convention', () => {
  const files = cssFiles(SRC)

  it('never outlines text with a dark colour or on a light background', () => {
    const bad = []
    for (const file of files) {
      parse(file).walkRules((rule) => {
        const d = ownDecls(rule)
        if (!hasStroke(d)) return
        const bg = d.background || d['background-color']
        if (isDarkColor(d.color) || (bg && LIGHT_BG.test(bg))) {
          bad.push(
            `${path.relative(SRC, file)}:${rule.source.start.line} ${rule.selector.replace(/\s+/g, ' ')}`
          )
        }
      })
    }
    expect(bad, 'outlined text on a light surface / dark text').toEqual([])
  })

  const tokens = parse(path.join(SRC, 'game/styles/tokens.css'))
  const optOut = new Set()
  let restore = ''
  tokens.walkRules((rule) => {
    const d = ownDecls(rule)
    if (d['--game-text-stroke-width'] === '0px') {
      for (const m of rule.selector.matchAll(/\.[\w-]+/g)) optOut.add(m[0])
    } else if (d['--game-text-stroke-width']?.includes('game-text-size-step')) {
      restore += rule.selector
    }
  })

  it('opts every shared light popup face out of the outline', () => {
    for (const face of [
      '.gm-panel-inner',
      '.game-confirm-card',
      '.hero-modal',
      '.game-territory-popup',
      '.dr-panel',
      '.pvp-pr-panel',
      '.set-card',
      '.club-page',
    ]) {
      expect(
        optOut.has(face),
        `${face} missing from the tokens.css opt-out`
      ).toBe(true)
    }
  })

  it('keeps the outline on buttons and ribbons inside light popups', () => {
    for (const cls of ['.gbtn', '.gm-ribbon', '.g-badge']) {
      expect(restore.includes(cls), `${cls} must restore the outline`).toBe(
        true
      )
    }
  })

  // Screens (not popups) that deliberately keep the default look.
  const SCREEN_ALLOWLIST = new Set(['.game-menu-sheet'])
  it('requires every new light popup/dialog/toast/sheet to join the opt-out', () => {
    const missing = []
    for (const file of files) {
      parse(file).walkRules((rule) => {
        const d = ownDecls(rule)
        const bg = d.background || d['background-color']
        if (!bg || !LIGHT_BG.test(bg)) return
        for (const sel of rule.selector.split(',').map((s) => s.trim())) {
          if (!/^\.[\w-]+$/.test(sel)) continue
          if (!/(modal|popup|dialog|prompt|confirm|toast|sheet)/i.test(sel))
            continue
          if (optOut.has(sel) || SCREEN_ALLOWLIST.has(sel)) continue
          // Parts of an already opted-out face (.hero-modal-chip, ...): the
          // tokens inherit down from the face, nothing to add.
          if ([...optOut].some((face) => sel.startsWith(face + '-'))) continue
          missing.push(
            `${path.relative(SRC, file)}:${rule.source.start.line} ${sel}`
          )
        }
      })
    }
    expect(
      missing,
      'light popup surface not in the tokens.css outline opt-out (see "Outlined-text convention")'
    ).toEqual([])
  })
})
