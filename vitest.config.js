import { defineConfig } from 'vitest/config'

// Deliberately not reusing vite.config.js's plugins here - basicSsl() and the
// maplibre worker-copy plugin only matter for `vite`/`vite build` and would
// just add startup cost (or risk cert generation) for a plain unit-test run.
export default defineConfig({
  // Automatic JSX runtime (matches vite.config.js's @vitejs/plugin-react,
  // without actually loading that plugin here) - every component source
  // file assumes it (none of them import React themselves), so without
  // this every one of them throws "React is not defined" the moment a
  // test renders it.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    // Component tests (.test.jsx) need a DOM - everything else (plain
    // util tests) stays on the faster/lighter node environment above.
    environmentMatchGlobs: [['src/**/*.test.jsx', 'jsdom']],
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
    setupFiles: ['src/test/setupTests.js'],
  },
})
