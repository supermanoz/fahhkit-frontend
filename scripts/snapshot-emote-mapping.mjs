#!/usr/bin/env node
// Snapshots the identity every emote-consuming screen depends on - which
// emoteN key exists for which hero, in which order, which ones are hidden
// from the shop, and which backend StoreItem names alias onto a key
// (EMOTE_NAME_ALIASES - "classic" -> emote1) - so the 2026-11 sheets
// rebuild (scripts/build_emote_sheets.py) can be proven to have moved zero
// identity: same keys, same order, same hidden set, same aliases, only the
// underlying art/frame-count/file-path changed. Deliberately does NOT
// record file paths or frame counts - those are expected to differ (that
// was the whole point of the rebuild) and diff-emote-mapping.mjs has
// nothing to ignore because this script never captures them.
//
// Usage:
//   node scripts/snapshot-emote-mapping.mjs before <path>   # reads git HEAD
//   node scripts/snapshot-emote-mapping.mjs after <path>    # reads the working tree
//
// "before" exists for provenance/documentation (how
// scripts/emote-mapping-before.json, committed as a frozen fixture, was
// produced) - don't re-run it after this work is committed, since HEAD
// will then be the AFTER state, not the pre-rebuild baseline. "after" is
// meant to be re-run on every build (see package.json's prebuild) and
// diffed against that frozen fixture.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HEROES = ['blaze', 'bolt', 'comet', 'cyclone', 'nova', 'phantom', 'pulse']

const [, , mode, outPath] = process.argv
if (!['before', 'after'].includes(mode) || !outPath) {
  console.error('Usage: node snapshot-emote-mapping.mjs <before|after> <outfile>')
  process.exit(1)
}

function readFile(relPath) {
  if (mode === 'before') {
    return execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
  }
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8')
}

function listDir(relPath) {
  if (mode === 'before') {
    return execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
  }
  return fs.readdirSync(path.join(REPO_ROOT, relPath))
}

// HIDDEN_EMOTES/EMOTE_NAME_ALIASES are plain object literals in
// src/utils/emotes.js - pulled out of the real source text (not
// reimplemented by hand here) so this snapshot can never silently drift
// from the actual registry it's auditing.
function extractObjectLiteral(src, constName) {
  const re = new RegExp(`const ${constName}\\s*=\\s*(\\{[\\s\\S]*?\\n\\})`)
  const m = src.match(re)
  if (!m) throw new Error(`could not find "const ${constName} = {...}" in emotes.js`)
  return new Function(`"use strict"; return (${m[1]});`)()
}

function numericKeySort(a, b) {
  return parseInt(a.replace('emote', ''), 10) - parseInt(b.replace('emote', ''), 10)
}

function emoteKeysFor(hero) {
  if (mode === 'before') {
    const manifest = JSON.parse(readFile(`src/assets/heroes/${hero}/manifest.json`))
    return Object.keys(manifest.emotes || {}).sort(numericKeySort)
  }
  const entries = listDir(`src/assets/heroes/${hero}/sheets`)
  return entries
    .map((k) => (k === 'idle' ? 'emote1' : k))
    .filter((k) => /^emote\d+$/.test(k))
    .sort(numericKeySort)
}

const emotesSrc = readFile('src/utils/emotes.js')
const HIDDEN_EMOTES = extractObjectLiteral(emotesSrc, 'HIDDEN_EMOTES')
const EMOTE_NAME_ALIASES = extractObjectLiteral(emotesSrc, 'EMOTE_NAME_ALIASES')

const heroes = {}
for (const hero of HEROES) {
  heroes[hero] = {
    emoteKeys: emoteKeysFor(hero),
    idleAliasKey: 'emote1',
    hiddenFromShop: [...(HIDDEN_EMOTES[hero] || [])].sort(),
  }
}

const snapshot = {
  mode,
  generatedAt: new Date().toISOString(),
  emoteNameAliases: EMOTE_NAME_ALIASES,
  heroes,
}

fs.mkdirSync(path.dirname(path.join(REPO_ROOT, outPath)), { recursive: true })
fs.writeFileSync(path.join(REPO_ROOT, outPath), `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`wrote ${outPath} (${mode})`)
