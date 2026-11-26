// Pure rules for "which backend does this build talk to, and is that the one
// this git branch is supposed to use". Used by scripts/check-backend-target.mjs
// (build guard) and unit-tested in src/config/backendTarget.test.js.
export const PROD_API = 'https://cafebizarre.com.np/fahhkit'
export const TEST_API = 'https://cafebizarre.com.np/fahhkit-test'

// branch -> backend it must use. Other branches are not enforced.
export const BRANCH_TARGETS = Object.freeze({
  main: 'production',
  RUN_CONQUER: 'test',
})

const trim = (u) => String(u || '').replace(/\/+$/, '')

// production | test | local | other
export function targetOfUrl(url) {
  const u = trim(url)
  if (u === PROD_API) return 'production'
  if (u === TEST_API) return 'test'
  if (/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(u))
    return 'local'
  return 'other'
}

// The branch a build is running for: hosting env first (CI checkouts are often
// detached), then git.
export function branchFromEnv(env, gitBranch) {
  return (
    env.BRANCH || // Netlify
    env.VERCEL_GIT_COMMIT_REF || // Vercel
    env.GITHUB_REF_NAME ||
    (gitBranch && gitBranch !== 'HEAD' ? gitBranch : '') ||
    ''
  )
}

export function evaluate({ branch, mode, env, allowMismatch = false }) {
  const url = trim(env.VITE_API_BASE_URL)
  const fallback = trim(env.VITE_API_FALLBACK_URL)
  const target = targetOfUrl(url)
  const declared = env.VITE_BACKEND_TARGET || ''
  const expected = BRANCH_TARGETS[branch] || null
  const problems = []
  // Never allowed to be inconsistent inside one build.
  if (declared && declared !== target)
    problems.push(
      `VITE_BACKEND_TARGET=${declared} but VITE_API_BASE_URL points at ${target} (${url}).`
    )
  const fallbackTarget = fallback ? targetOfUrl(fallback) : null
  if (
    fallbackTarget &&
    (target === 'production' || target === 'test') &&
    (fallbackTarget === 'production' || fallbackTarget === 'test') &&
    fallbackTarget !== target
  )
    problems.push(
      `VITE_API_FALLBACK_URL (${fallback}) is the other backend: a network blip would silently switch environments.`
    )
  // The branch rule, overridable on purpose.
  const branchMismatch = expected && target !== expected
  if (branchMismatch)
    problems.push(
      `branch "${branch}" must build for the ${expected} backend, but mode "${mode}" targets ${target} (${url}).`
    )
  const overridden = Boolean(branchMismatch && allowMismatch)
  const blocking = problems.filter(
    (p) => !(overridden && p.startsWith('branch '))
  )
  return {
    branch,
    mode,
    url,
    target,
    expected,
    problems,
    overridden,
    ok: blocking.length === 0,
  }
}
