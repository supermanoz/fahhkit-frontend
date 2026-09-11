import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// maplibre-gl's worker script imports a sibling "maplibre-gl-shared.mjs"
// by a hardcoded relative path, so the two files have to be served
// next to each other, unhashed, at a stable URL — copying them into
// public/ (verbatim, from whatever maplibre-gl version is installed)
// makes Vite serve them as-is in both dev and the production build. See
// the setWorkerUrl call in TerritoryMap.jsx for the other half of this.
function copyMaplibreWorker() {
  return {
    name: 'copy-maplibre-worker',
    buildStart() {
      const dest = fileURLToPath(new URL('public/mlgl/', import.meta.url))
      mkdirSync(dest, { recursive: true })
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        copyFileSync(
          fileURLToPath(
            new URL(`node_modules/maplibre-gl/dist/${file}`, import.meta.url)
          ),
          dest + file
        )
      }
    },
  }
}

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
  plugins: [react(), basicSsl(), copyMaplibreWorker()],
  // listen on the LAN, not just localhost, so a phone on the same wifi can load it
  server: { host: true },
  assetsInclude: ['**/*.jfif'],
  // maplibre-gl loads its parser in a Web Worker; Vite's dep pre-bundling
  // mangles that worker's own import (it never resolves, stalling every
  // vector tile fetch on the /game map), so it has to run un-bundled.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
