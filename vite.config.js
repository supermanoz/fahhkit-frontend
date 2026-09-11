import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
// Netlify serves from the domain root, GitHub Pages serves from /fahhkit/ —
// only apply the GH Pages base when explicitly building for that deploy.
export default defineConfig({
  base: process.env.GH_PAGES ? '/fahhkit/' : '/',
  // navigator.geolocation (used all over /game and run-tracking) only
  // works in a "secure context" — localhost counts, but a phone hitting the
  // dev server over plain http://<lan-ip>:5173 does not, so it silently
  // fails with no error callback ever firing. A self-signed HTTPS cert
  // (only used for `vite`/`vite dev`, not the production build) fixes that;
  // the phone's browser will show a one-time "not secure" warning to click
  // through the first time it connects.
  plugins: [react(), basicSsl()],
  // listen on the LAN, not just localhost, so a phone on the same wifi can load it
  server: { host: true },
  assetsInclude: ['**/*.jfif'],
  // maplibre-gl loads its parser in a Web Worker; Vite's dep pre-bundling
  // mangles that worker's own import (it never resolves, stalling every
  // vector tile fetch on the /game map), so it has to run un-bundled.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
