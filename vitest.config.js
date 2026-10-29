import { defineConfig } from 'vitest/config'

// Deliberately not reusing vite.config.js's plugins here - basicSsl() and the
// maplibre worker-copy plugin only matter for `vite`/`vite build` and would
// just add startup cost (or risk cert generation) for a plain unit-test run.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
