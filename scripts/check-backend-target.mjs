// Build guard: prints which backend this build targets and refuses to continue
// if it is the wrong one for the git branch.
//   node scripts/check-backend-target.mjs --mode production|staging [--allow-mismatch]
// Override on purpose with --allow-mismatch or ALLOW_BACKEND_MISMATCH=1.
import { execSync } from 'node:child_process'
import { loadEnv } from 'vite'
import { branchFromEnv, evaluate } from './backendTarget.mjs'

const args = process.argv.slice(2)
const modeIdx = args.indexOf('--mode')
const mode = modeIdx >= 0 ? args[modeIdx + 1] : 'production'
const allowMismatch =
  args.includes('--allow-mismatch') ||
  process.env.ALLOW_BACKEND_MISMATCH === '1'

let gitBranch = ''
try {
  gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
} catch {
  // not a git checkout
}
const branch = branchFromEnv(process.env, gitBranch)
const env = loadEnv(mode, process.cwd(), '')
const r = evaluate({ branch, mode, env, allowMismatch })

const line = '='.repeat(64)
console.log(line)
console.log(` BACKEND TARGET: ${r.target.toUpperCase()}`)
console.log(` API:    ${r.url || '(unset)'}`)
console.log(` mode:   ${mode}    branch: ${branch || '(unknown)'}`)
if (r.expected) console.log(` rule:   ${branch} -> ${r.expected}`)
console.log(line)
for (const p of r.problems)
  console.error(
    `${r.overridden && p.startsWith('branch ') ? 'WARNING (override)' : 'ERROR'}: ${p}`
  )
if (!r.ok) {
  console.error(
    '\nRefusing to build. Use the matching script (npm run build:prod on main, ' +
      'npm run build:test on RUN_CONQUER), or pass --allow-mismatch / ' +
      'ALLOW_BACKEND_MISMATCH=1 if this is deliberate.'
  )
  process.exit(1)
}
