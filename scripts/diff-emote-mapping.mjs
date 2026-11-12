#!/usr/bin/env node
// Fails (non-zero exit) if the live working tree's emote identity has
// drifted from the frozen pre-rebuild baseline
// (scripts/emote-mapping-before.json, see snapshot-emote-mapping.mjs's own
// header for how it was produced) - same hero set, same emoteN keys in the
// same order, same hidden-from-shop list, same "classic"-style name
// aliases. File paths and frame counts were never captured by either
// snapshot, so there's nothing to "ignore" here - a real difference in
// this diff always means something actually moved, renamed or reordered.
//
// Run after rebuilding any hero's sheets (wired into package.json's
// prebuild, after verify-emote-sheets.mjs):
//   node scripts/diff-emote-mapping.mjs scripts/emote-mapping-before.json scripts/emote-mapping-after.json

import fs from 'node:fs'

const [, , beforePath, afterPath] = process.argv
if (!beforePath || !afterPath) {
  console.error('Usage: node diff-emote-mapping.mjs <before.json> <after.json>')
  process.exit(1)
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'))
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'))

const problems = []
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const beforeHeroes = Object.keys(before.heroes).sort()
const afterHeroes = Object.keys(after.heroes).sort()
if (!eq(beforeHeroes, afterHeroes)) {
  problems.push(`hero set differs - before=${beforeHeroes.join(',')} after=${afterHeroes.join(',')}`)
}

for (const hero of beforeHeroes) {
  const b = before.heroes[hero]
  const a = after.heroes[hero]
  if (!a) {
    problems.push(`${hero}: present in before, missing from after`)
    continue
  }
  if (!eq(b.emoteKeys, a.emoteKeys)) {
    problems.push(
      `${hero}: emote key set/order differs\n` +
        `    before: [${b.emoteKeys.join(', ')}]\n` +
        `    after:  [${a.emoteKeys.join(', ')}]`
    )
  }
  if (b.idleAliasKey !== a.idleAliasKey) {
    problems.push(`${hero}: idle alias key changed (before=${b.idleAliasKey} after=${a.idleAliasKey})`)
  }
  if (!eq(b.hiddenFromShop, a.hiddenFromShop)) {
    problems.push(
      `${hero}: hidden-from-shop list differs\n` +
        `    before: [${b.hiddenFromShop.join(', ')}]\n` +
        `    after:  [${a.hiddenFromShop.join(', ')}]`
    )
  }
}

if (!eq(before.emoteNameAliases, after.emoteNameAliases)) {
  problems.push(
    `EMOTE_NAME_ALIASES differs - before=${JSON.stringify(before.emoteNameAliases)} ` +
      `after=${JSON.stringify(after.emoteNameAliases)}`
  )
}

if (problems.length) {
  console.error('emote-mapping-diff: IDENTITY DRIFTED from the pre-rebuild baseline:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

console.log('emote-mapping-diff: IDENTICAL to the pre-rebuild baseline (same hero/emote keys, order, hidden list, and name aliases)')
