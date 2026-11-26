import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PROD_API,
  TEST_API,
  branchFromEnv,
  evaluate,
  targetOfUrl,
} from '../../scripts/backendTarget.mjs'
import { withBackendLabel } from './backend'

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
const parse = (text) =>
  Object.fromEntries(
    text
      .split('\n')
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  )
const prodEnv = parse(read('.env.production'))
const testEnv = parse(read('.env.staging'))

describe('env files: one source of truth', () => {
  it('production file -> prod API, staging file -> test API', () => {
    expect(prodEnv.VITE_API_BASE_URL).toBe(PROD_API)
    expect(prodEnv.VITE_BACKEND_TARGET).toBe('production')
    expect(testEnv.VITE_API_BASE_URL).toBe(TEST_API)
    expect(testEnv.VITE_BACKEND_TARGET).toBe('test')
  })
  it('same variable names in both; neither falls back to the other backend', () => {
    expect(Object.keys(testEnv).sort()).toEqual(Object.keys(prodEnv).sort())
    expect(prodEnv.VITE_API_FALLBACK_URL).toBe('')
    expect(testEnv.VITE_API_FALLBACK_URL).toBe('')
  })
  it('only the backend differs (site URL and other settings untouched)', () => {
    const diff = Object.keys(prodEnv).filter((k) => prodEnv[k] !== testEnv[k])
    expect(diff.sort()).toEqual(['VITE_API_BASE_URL', 'VITE_BACKEND_TARGET'])
  })
})

describe('build scripts and hosting follow the same mapping', () => {
  const pkg = JSON.parse(read('package.json')).scripts
  it('build:prod / build:test use the right mode and run the guard first', () => {
    expect(pkg['build:prod']).toMatch(
      /^npm run check:backend:prod .*--mode production$/
    )
    expect(pkg['build:test']).toMatch(
      /^npm run check:backend:test .*--mode staging$/
    )
    expect(pkg['check:backend:prod']).toContain('--mode production')
    expect(pkg['check:backend:test']).toContain('--mode staging')
  })
  it('native scripts exist for both modes, default = production', () => {
    expect(pkg['build:app:prod']).toContain('--mode production')
    expect(pkg['build:app:test']).toContain('--mode staging')
    expect(pkg['cap:sync']).toBe('npm run cap:sync:prod')
    expect(pkg['android:release:test']).toContain('-Pbackend=test')
    expect(pkg['android:apk:test']).toContain('cap:sync:test')
    expect(pkg['android:apk:prod']).not.toContain('backend=test')
  })
  it('Netlify: only the production context builds for prod; Vercel always test', () => {
    const toml = read('netlify.toml')
    expect(toml).toMatch(
      /\[context\.production\]\s+command = "npm run build:prod"/
    )
    expect(toml).toMatch(
      /\[context\.branch-deploy\]\s+command = "npm run build:test"/
    )
    expect(toml).toMatch(
      /\[context\.deploy-preview\]\s+command = "npm run build:test"/
    )
    expect(toml).toMatch(/\[build\]\s+command = "npm run build:test"/)
    expect(JSON.parse(read('vercel.json')).buildCommand).toBe(
      'npm run build:test'
    )
  })
})

describe('guard rail', () => {
  const env = (url, target) => ({
    VITE_API_BASE_URL: url,
    VITE_BACKEND_TARGET: target,
  })
  it('classifies urls', () => {
    expect(targetOfUrl(`${PROD_API}/`)).toBe('production')
    expect(targetOfUrl(TEST_API)).toBe('test')
    expect(targetOfUrl('http://localhost:8080')).toBe('local')
    expect(targetOfUrl('https://elsewhere.example')).toBe('other')
  })
  it('main + prod and RUN_CONQUER + test pass', () => {
    expect(
      evaluate({
        branch: 'main',
        mode: 'production',
        env: env(PROD_API, 'production'),
      }).ok
    ).toBe(true)
    expect(
      evaluate({
        branch: 'RUN_CONQUER',
        mode: 'staging',
        env: env(TEST_API, 'test'),
      }).ok
    ).toBe(true)
  })
  it('main + test URL fails, RUN_CONQUER + prod URL fails', () => {
    const a = evaluate({
      branch: 'main',
      mode: 'staging',
      env: env(TEST_API, 'test'),
    })
    expect(a.ok).toBe(false)
    expect(a.problems[0]).toMatch(/branch "main" must build for the production/)
    const b = evaluate({
      branch: 'RUN_CONQUER',
      mode: 'production',
      env: env(PROD_API, 'production'),
    })
    expect(b.ok).toBe(false)
  })
  it('the override lets a deliberate mismatch through, but never an inconsistent build', () => {
    const o = evaluate({
      branch: 'main',
      mode: 'staging',
      env: env(TEST_API, 'test'),
      allowMismatch: true,
    })
    expect(o.ok).toBe(true)
    expect(o.overridden).toBe(true)
    const bad = evaluate({
      branch: 'main',
      mode: 'production',
      env: env(TEST_API, 'production'),
      allowMismatch: true,
    })
    expect(bad.ok).toBe(false) // label says production, URL says test
  })
  it('a fallback to the other backend is refused', () => {
    const r = evaluate({
      branch: 'feature/x',
      mode: 'production',
      env: { ...env(PROD_API, 'production'), VITE_API_FALLBACK_URL: TEST_API },
    })
    expect(r.ok).toBe(false)
  })
  it('other branches are not enforced; hosting branch env wins over git', () => {
    expect(
      evaluate({
        branch: 'feature/x',
        mode: 'staging',
        env: env(TEST_API, 'test'),
      }).ok
    ).toBe(true)
    expect(branchFromEnv({ BRANCH: 'main' }, 'HEAD')).toBe('main')
    expect(branchFromEnv({}, 'RUN_CONQUER')).toBe('RUN_CONQUER')
    expect(branchFromEnv({ VERCEL_GIT_COMMIT_REF: 'RUN_CONQUER' }, '')).toBe(
      'RUN_CONQUER'
    )
  })
})

describe('version label', () => {
  it('"1.1.1 · test" only on the test backend', () => {
    expect(withBackendLabel('1.1.1', true, true)).toBe('1.1.1 · test')
    expect(withBackendLabel('1.1.1', false, true)).toBe('1.1.1')
    // Players never see an environment label, even on a staging build.
    expect(withBackendLabel('1.1.1', true, false)).toBe('1.1.1')
  })
})
