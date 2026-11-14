import { defineConfig, devices } from '@playwright/test'

// E2E config for /game. The backend isn't reachable in this environment (or
// most dev boxes without a local Spring Boot instance running) - every test
// mocks the API via e2e/fixtures/mockApi.js's route interception instead of
// hitting a real server, so these are safe to run anywhere `npm run dev`
// starts. No fixed sleeps anywhere in e2e/ - Playwright's own auto-waiting
// (locator assertions, toPass, etc.) handles timing; see each spec's own
// comments where something non-obvious needed a specific wait condition.
// E2E_PROD=1 runs the suite against the *production build* (`npm run build`
// output served by `vite preview`, API base = the prod URL baked into it)
// instead of the dev server, and also serves the native-shell build
// (`npm run build:app` -> dist-app) for e2e/native-shell.spec.js. Build both
// first. The API is mocked either way (route `**/v1/**` matches any base).
const E2E_PROD = process.env.E2E_PROD === '1'
const WEB_PORT = E2E_PROD ? 5175 : 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Most specs wait on the real, unmocked basemap tile network
  // (tiles.openfreemap.org - see main-map.spec.js's own comment on why
  // that one piece isn't mocked) to reach "idle" before the app's own
  // loading screen clears. Running many of those at once over a single
  // real connection is resource contention, not app flakiness - running
  // the full suite with Playwright's default (CPU-count) workers produced
  // cascading 30s timeouts that a lower, fixed worker count doesn't.
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  timeout: 45_000,
  use: {
    baseURL: `https://localhost:${WEB_PORT}`,
    // The dev server's cert is self-signed (basicSsl plugin in
    // vite.config.js - geolocation needs a secure context, which plain
    // http:// LAN access doesn't count as).
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-390',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'small-360',
      use: { ...devices['Galaxy S8'], viewport: { width: 360, height: 640 } },
    },
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: E2E_PROD
    ? [
        {
          command: 'npx vite preview --port 5175 --strictPort',
          url: 'https://localhost:5175',
          reuseExistingServer: true,
          ignoreHTTPSErrors: true,
          timeout: 60_000,
        },
        {
          command:
            'npx vite preview --outDir dist-app --port 5176 --strictPort',
          url: 'https://localhost:5176',
          reuseExistingServer: true,
          ignoreHTTPSErrors: true,
          timeout: 60_000,
        },
      ]
    : {
        command: 'npm run dev -- --port 5174 --strictPort',
        url: 'https://localhost:5174',
        reuseExistingServer: true,
        ignoreHTTPSErrors: true,
        timeout: 60_000,
      },
})
