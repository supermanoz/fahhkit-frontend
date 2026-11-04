# FahhKit Run Club — Frontend

React (Vite) frontend for the FahhKit Run Club website. Talks to the [FahhKit backend](../FahhKit) API — deployed separately.

## Development

```
npm install
npm run dev
```

Runs at `http://localhost:5173`. The backend must be running separately (see the FahhKit repo) — by default the app calls `http://localhost:8080`, set via `VITE_API_BASE_URL` in `.env`.

To point at a different backend locally, create `.env.local` (gitignored) and override:

```
VITE_API_BASE_URL=http://localhost:8080
```

## Deploying (Netlify)

1. Connect this repo in Netlify — it reads `netlify.toml` automatically (build command `npm run build`, publish dir `dist`, SPA redirect already configured).
2. In Netlify's site settings → **Environment variables**, set:
   ```
   VITE_API_BASE_URL=<production backend URL>
   ```
   (Vite bakes env vars in at build time, so this must be set in Netlify, not just locally.)
3. Trigger a deploy.

## Android app (Run Conquest)

A separate Capacitor-wrapped build of just `/game`, shipped as its own app ("Run Conquest",
`com.runconquest.game`) - the website itself is unaffected (still `npm run build` → `dist`, unchanged
base path/routes). The app build uses a different output dir (`dist-app`) and an env flag
(`VITE_APP_SHELL=true`, set by `npm run build:app`) that makes `App.jsx` root at `<GamePage />`
instead of the marketing homepage; every other route `/game` already links to (shop, profile,
history, a run's detail page, …) is unchanged and still reachable.

### Building

```
npm run android:debug     # builds dist-app, cap sync, then ./gradlew assembleDebug
npm run android:release   # same, but ./gradlew bundleRelease (signed AAB, see below)
npm run android:open      # builds + syncs, then opens the project in Android Studio
```

Needs the Android SDK (platform 34, build-tools 34.0.0) and a JDK on `PATH`/`ANDROID_HOME`; point
`android/local.properties` (gitignored) at your SDK with `sdk.dir=/path/to/Android/Sdk` if Gradle
can't find it.

Debug APK lands at `android/app/build/outputs/apk/debug/app-debug.apk` - install it straight to a
device/emulator with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

### Release signing

Never commit a keystore. Generate one once:

```
keytool -genkeypair -v -keystore runconquest-release.keystore -alias runconquest \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/app/keystore.properties` (gitignored, never committed):

```
storeFile=/absolute/path/to/runconquest-release.keystore
storePassword=...
keyAlias=runconquest
keyPassword=...
```

(or set `RUNCONQUEST_KEYSTORE_FILE` / `RUNCONQUEST_KEYSTORE_PASSWORD` / `RUNCONQUEST_KEY_ALIAS` /
`RUNCONQUEST_KEY_PASSWORD` env vars instead - CI-friendly, same effect.) Without either, `assembleRelease`/
`bundleRelease` still produce an **unsigned** build.

### Google Sign-In (native)

The web Google Identity Services flow doesn't work inside a WebView, so the app uses
`@codetrix-studio/capacitor-google-auth` instead (same `/v1/auth/google` backend endpoint either
way - see `src/components/GoogleSignInButton.jsx`). In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
(same project as the existing web OAuth client, `VITE_GOOGLE_CLIENT_ID`):

1. Create an **OAuth client ID** → application type **Android**.
2. Package name: `com.runconquest.game`.
3. SHA-1 certificate fingerprint:
   - Debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`
   - Release: `keytool -list -v -keystore runconquest-release.keystore -alias runconquest`
4. Save. No client ID needs to be pasted into the app for this one - Google Play Services matches
   it by package name + SHA-1 automatically. `capacitor.config.json`'s `plugins.GoogleAuth.serverClientId`
   is already set to the existing **web** client ID, so the ID token the app gets back is audienced
   exactly the way the backend already verifies it - no backend change.

### Play Store notes

- **In-app currency (Fahhcoins)**: Google Play requires all digital-goods purchases to go through
  Google Play Billing, not a web checkout. The current Fahhcoins shop flow isn't wired to Play
  Billing - if this ships to the Play Store with real-money purchases, that's a separate, real
  integration (its own SKUs in Play Console, a billing library, server-side receipt verification),
  not something this pass added.
- **Background location**: tracking keeps running with the screen locked via a foreground service +
  persistent notification (`@capacitor-community/background-geolocation`), which does **not** need
  `ACCESS_BACKGROUND_LOCATION` or Play Console's background-location declaration form - a foreground
  service is exempt from that restriction. If a future change needs location _without_ an active,
  visible foreground service, that calculus changes.
