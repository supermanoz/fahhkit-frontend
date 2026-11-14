/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { SPRITE_FRAME_MS } from '../utils/spriteTiming'
import { acquireSheet, releaseSheet } from '../utils/spriteSheetCache'
import './AnimatedSprite.css'

// The one shared player for every hero sprite-sheet animation in the app -
// idle turntables and every emote alike (Shop, Me, other-player profile,
// leaderboard, HUD, run view, Club War, results - anywhere EmoteGlyph.jsx
// or HeroFigure.jsx is used). Takes a {frameCount, frameWidth,
// frameHeight, sheets: [{cols, rows, frames, loadUrl}]} manifest (see
// heroManifest.js's resolveSheets) built by scripts/build_emote_sheets.py
// - every sheet is a lossless grid pack of that many native-resolution
// source frames (no resize/resample/frame-drop), split across more than
// one sheet only when a single grid would exceed a phone GPU's texture
// size limit. frameIndex = floor(elapsedMs / SPRITE_FRAME_MS) % frameCount
// - a longer sequence (idle's 235 frames vs. a short gesture's 27) just
// takes proportionally longer to loop at the same one shared pace, never
// squeezed or stretched to fit a fixed duration.
//
// Two render layers, cross-faded:
// - a static CSS background crop of sheet 0's first cell (frame 0) - no
//   JS decode, same cheap "frozen tile" a Shop/Me grid of many inactive
//   instances has always relied on (see EmoteGlyph.jsx's own history) -
//   shown immediately and left up until the canvas layer is ready.
// - a <canvas>, only decoded and driven by requestAnimationFrame while
//   `active` - every sheet this sequence needs is fetched + fully decoded
//   (utils/spriteSheetCache.js: createImageBitmap, cached + refcounted,
//   "load only when shown, release when not") before the loop starts, so
//   nothing flickers or shows a not-yet-loaded sheet mid-playback.
//
// Pausing while the tab is hidden comes from requestAnimationFrame's own
// browser-level suspension (free - no extra code needed to stop drawing);
// the elapsed-time anchor is shifted forward by however long the tab
// stayed hidden (visibilitychange below) so that gap is excluded rather
// than "catching up" in a jump once the tab is visible again - a real
// pause/resume, not a skip. prefers-reduced-motion skips the animation
// loop entirely and leaves the static frame-0 layer showing, matching
// every other motion-respecting surface in this app.
export default function AnimatedSprite({
  frameCount,
  frameWidth,
  frameHeight,
  sheets,
  height,
  active = false,
  className = '',
  // Optional, for callers that overlay this on something else (the HUD
  // hero's equipped emote, see TerritoryMap.jsx): `onReady(true|false)`
  // fires once every sheet is decoded (`onError` if one fails) and the loop is drawing (and false
  // again on teardown), `showStatic={false}` skips the frame-0 preview so
  // nothing shows until then, and `paused` stops the rAF loop without
  // releasing the decoded sheets (the clock is shifted on resume, so the
  // gap isn't skipped over). Defaults leave every other call site as is.
  paused = false,
  onReady,
  onError,
  showStatic = true,
}) {
  const width = Math.round((height * frameWidth) / frameHeight)
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [staticUrl, setStaticUrl] = useState(null)
  const controlRef = useRef(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const firstSheet = sheets?.[0]

  // Frame 0 - loaded eagerly regardless of `active` (a cheap plain image
  // fetch, not a decode), so an inactive grid tile still shows real art
  // immediately instead of a blank box.
  useEffect(() => {
    let cancelled = false
    if (firstSheet) {
      firstSheet.loadUrl().then((url) => {
        if (!cancelled) setStaticUrl(url)
      })
    }
    return () => {
      cancelled = true
    }
  }, [firstSheet])

  useEffect(() => {
    setReady(false)
    if (!active || !sheets?.length) return undefined
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    let cancelled = false
    let rafId = null
    let startTime = null
    let hiddenSince = null
    let pausedAt = null
    const urls = []

    function onVisibility() {
      if (document.hidden) {
        hiddenSince = performance.now()
      } else if (hiddenSince != null && startTime != null) {
        startTime += performance.now() - hiddenSince
        hiddenSince = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    ;(async () => {
      let bitmaps
      try {
        const urlList = await Promise.all(sheets.map((s) => s.loadUrl()))
        if (cancelled) return
        urlList.forEach((u) => urls.push(u))
        bitmaps = await Promise.all(urlList.map((u) => acquireSheet(u)))
      } catch {
        // A sheet failed to load/decode: stay not-ready (the static
        // frame, or whatever the caller shows underneath, stays up).
        urls.splice(0).forEach(releaseSheet)
        if (!cancelled) onErrorRef.current?.()
        return
      }
      if (cancelled) {
        urls.forEach(releaseSheet)
        return
      }

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!ctx) return

      const sheetStarts = []
      let acc = 0
      for (const s of sheets) {
        sheetStarts.push(acc)
        acc += s.frames
      }

      let lastDrawnIndex = -1
      function draw(frameIndex) {
        let sheetI = sheets.length - 1
        for (let i = 0; i < sheets.length; i += 1) {
          if (frameIndex < sheetStarts[i] + sheets[i].frames) {
            sheetI = i
            break
          }
        }
        const localIndex = frameIndex - sheetStarts[sheetI]
        const sheet = sheets[sheetI]
        const col = localIndex % sheet.cols
        const row = Math.floor(localIndex / sheet.cols)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(
          bitmaps[sheetI],
          col * frameWidth,
          row * frameHeight,
          frameWidth,
          frameHeight,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }

      function tick(now) {
        if (cancelled) return
        if (startTime == null) startTime = now
        if (!document.hidden) {
          const elapsed = now - startTime
          const frameIndex = Math.floor(elapsed / SPRITE_FRAME_MS) % frameCount
          if (frameIndex !== lastDrawnIndex) {
            lastDrawnIndex = frameIndex
            draw(frameIndex)
          }
        }
        rafId = requestAnimationFrame(tick)
      }

      controlRef.current = {
        pause() {
          if (rafId) cancelAnimationFrame(rafId)
          rafId = null
          if (pausedAt == null) pausedAt = performance.now()
        },
        resume() {
          if (cancelled || rafId) return
          if (pausedAt != null && startTime != null) {
            startTime += performance.now() - pausedAt
          }
          pausedAt = null
          rafId = requestAnimationFrame(tick)
        },
      }

      draw(0)
      setReady(true)
      onReadyRef.current?.(true)
      if (pausedRef.current) {
        pausedAt = performance.now()
      } else {
        rafId = requestAnimationFrame(tick)
      }
    })()

    return () => {
      cancelled = true
      controlRef.current = null
      onReadyRef.current?.(false)
      if (rafId) cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibility)
      urls.forEach(releaseSheet)
    }
  }, [active, sheets, frameCount, frameWidth, frameHeight])

  useEffect(() => {
    if (paused) controlRef.current?.pause()
    else controlRef.current?.resume()
  }, [paused])

  return (
    <span
      className={`animated-sprite ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      {showStatic && staticUrl && firstSheet && (
        <span
          className="animated-sprite-static"
          style={{
            width,
            height,
            backgroundImage: `url(${staticUrl})`,
            backgroundSize: `${width * firstSheet.cols}px ${height * firstSheet.rows}px`,
            opacity: ready ? 0 : 1,
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        width={frameWidth}
        height={frameHeight}
        className="animated-sprite-canvas"
        style={{ width, height, opacity: ready ? 1 : 0 }}
      />
    </span>
  )
}
