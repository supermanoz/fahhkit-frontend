/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { shareExtraStats } from '../utils/runMetrics'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveHeroKey } from '../utils/heroPoster'
import { IconChevronLeft, IconChevronRight } from './GameIcons'
import { isNative } from '../utils/geo'
import {
  openAppSettings,
  outcomeFromSave,
  saveImageToPhotos,
  shareImageFile,
} from '../utils/saveImage'
import ExportButton from './ExportButton'
import { EXPORT_MESSAGES, withTimeout } from '../hooks/useExportAction'
import { motion } from 'framer-motion'
import {
  SHARE_VARIANTS,
  cardSize,
  downloadBlob,
  drawShareCard,
  exportShareCardBlob,
} from '../utils/shareCanvas'
import './ShareRunCarousel.css'

const SLIDES = [
  {
    // The default: full-bleed hero poster with the stats on the right.
    variant: SHARE_VARIANTS.HERO_POSTER,
    label: 'Hero Poster',
    badge: 'PNG',
    ext: 'png',
    mime: 'image/png',
  },
  {
    variant: SHARE_VARIANTS.TRANSPARENT,
    label: 'Transparent Route',
    badge: 'PNG',
    ext: 'png',
    mime: 'image/png',
    checkerboard: true,
  },
  {
    // Strava-style sticker for laying over a photo: real transparent PNG
    // (4:5), route behind, stats in front. Second slide on purpose.
    variant: SHARE_VARIANTS.OVERLAY,
    label: 'Overlay',
    badge: 'PNG',
    ext: 'png',
    mime: 'image/png',
    checkerboard: true,
    size: 'portrait',
  },
  {
    variant: SHARE_VARIANTS.GRADIENT,
    label: 'Brand Gradient',
    badge: 'PNG',
    ext: 'png',
    mime: 'image/png',
  },
  {
    variant: SHARE_VARIANTS.MAP,
    label: 'Map Snapshot',
    badge: 'JPG',
    ext: 'jpg',
    mime: 'image/jpeg',
    quality: 0.92,
  },
]

// Swipeable set of downloadable share-card styles for a completed run.
// Each canvas preview is drawn with the exact same function used to render
// the downloaded file, so what's shown here is what gets saved.
export default function ShareRunCarousel({ run, heroFallback = null }) {
  const [index, setIndex] = useState(0)
  // loadout -> hero saved on the run -> equipped hero (see utils/heroPoster).
  const heroKey = useMemo(
    () => resolveHeroKey(run, heroFallback),
    [run, heroFallback?.id, heroFallback?.name] // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Popup toast (solid card, bottom of the popup) for export success/failure.
  const [toastMsg, setToastMsg] = useState(null)
  const toastTimer = useRef(null)
  const notify = useCallback((next) => {
    clearTimeout(toastTimer.current)
    setToastMsg(next)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width)
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function goTo(i) {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)))
  }

  function handleDragEnd(_, info) {
    const distanceThreshold = containerWidth * 0.25
    const velocityThreshold = 500
    if (
      info.offset.x < -distanceThreshold ||
      info.velocity.x < -velocityThreshold
    ) {
      goTo(index + 1)
    } else if (
      info.offset.x > distanceThreshold ||
      info.velocity.x > velocityThreshold
    ) {
      goTo(index - 1)
    }
  }

  // The same card render the web download uses (what the preview shows) -
  // transparent PNG stays transparent, the map card stays a JPG.
  function renderBlob(slide) {
    return exportShareCardBlob({
      points: run.points,
      distance: run.distance,
      duration: run.duration,
      pace: run.avgPace,
      extraStats: shareExtraStats(run),
      variant: slide.variant,
      mimeType: slide.mime,
      quality: slide.quality,
      size: slide.size,
      heroKey,
    })
  }
  const fileNameFor = (slide) =>
    slide.variant === SHARE_VARIANTS.HERO_POSTER
      ? `run-conquest-hero-${run.id}.png`
      : slide.variant === SHARE_VARIANTS.OVERLAY
        ? `run-conquest-overlay-${run.id}.png`
        : `run-conquest-run-${run.id}-${slide.variant}.${slide.ext}`

  // One export per button (ExportButton / useExportAction own the loading,
  // success and error states). Each returns what the hook needs to report.
  async function exportSlide(slide, action) {
    const filename = fileNameFor(slide)
    if (!isNative) {
      downloadBlob(await renderBlob(slide), filename)
      return { message: EXPORT_MESSAGES.downloaded }
    }
    // The 15s limit covers building the image only - the share sheet stays
    // open as long as the player likes.
    const blob = await withTimeout(renderBlob(slide), 15000)
    if (action === 'share') {
      return outcomeFromSave(await shareImageFile(blob, filename))
    }
    return outcomeFromSave(await saveImageToPhotos(blob, filename))
  }

  return (
    <div
      className={`share-carousel glass-card${isNative ? ' is-native' : ''}`}
      ref={containerRef}
    >
      <div className="share-carousel-viewport">
        <motion.div
          className="share-carousel-track"
          drag="x"
          dragConstraints={{
            left: -(SLIDES.length - 1) * containerWidth,
            right: 0,
          }}
          dragElastic={0.15}
          animate={{ x: -index * containerWidth }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          onDragEnd={handleDragEnd}
        >
          {SLIDES.map((slide) => (
            <div
              className="share-carousel-slide"
              key={slide.variant}
              style={{ width: containerWidth || '100%' }}
            >
              <ShareCardPreview run={run} slide={slide} heroKey={heroKey} />
              <div className="share-carousel-slide-footer">
                <span className="share-carousel-slide-label">
                  {slide.label}
                </span>
                <ExportButton
                  className="btn btn-primary btn-block"
                  idleLabel={`Download ${slide.ext.toUpperCase()}`}
                  loadingLabel="Saving..."
                  run={() => exportSlide(slide, 'save')}
                  onNotify={notify}
                  timeoutMs={isNative ? null : 15000}
                  testId={`download-${slide.variant}`}
                >
                  {({ permissionDenied }) =>
                    isNative &&
                    permissionDenied && (
                      <div className="share-carousel-permission" role="alert">
                        <p>
                          Photos access is off, so we can&apos;t save the image.
                          Allow it in Settings, or use Share.
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => openAppSettings().catch(() => {})}
                        >
                          Open settings
                        </button>
                      </div>
                    )
                  }
                </ExportButton>
                {isNative && (
                  <ExportButton
                    className="btn btn-outline btn-block"
                    idleLabel="Share"
                    loadingLabel="Preparing..."
                    icon={null}
                    run={() => exportSlide(slide, 'share')}
                    onNotify={notify}
                    timeoutMs={null}
                    testId={`share-${slide.variant}`}
                  />
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      <button
        type="button"
        className="share-carousel-arrow prev"
        aria-label="Previous style"
        onClick={() => goTo(index - 1)}
        disabled={index === 0}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="share-carousel-arrow next"
        aria-label="Next style"
        onClick={() => goTo(index + 1)}
        disabled={index === SLIDES.length - 1}
      >
        <IconChevronRight />
      </button>

      <div className="share-carousel-toast-slot" aria-live="polite">
        {toastMsg && (
          <div
            className={`share-carousel-toast share-carousel-toast--${toastMsg.type}`}
            role="status"
            data-testid="export-toast"
          >
            <span className="share-carousel-toast-icon" aria-hidden="true">
              {toastMsg.type === 'success' ? '✓' : '✕'}
            </span>
            {toastMsg.message}
          </div>
        )}
      </div>

      <div className="share-carousel-dots">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.variant}
            type="button"
            className={`share-carousel-dot ${i === index ? 'active' : ''}`}
            aria-label={`Show ${slide.label}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  )
}

function ShareCardPreview({ run, slide, heroKey }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const { w: CARD_W, h: CARD_H } = cardSize(slide.variant, slide.size)
    canvas.width = CARD_W * dpr
    canvas.height = CARD_H * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    drawShareCard(ctx, {
      width: CARD_W,
      height: CARD_H,
      points: run.points,
      distance: run.distance,
      duration: run.duration,
      pace: run.avgPace,
      extraStats: shareExtraStats(run),
      variant: slide.variant,
      heroKey,
    }).catch(() => {})
  }, [run, slide.variant, slide.size, heroKey])

  const { w: CARD_W, h: CARD_H } = cardSize(slide.variant, slide.size)

  return (
    <div
      className={`share-card-canvas-wrap${slide.checkerboard ? ' checkerboard' : ''}`}
    >
      <span className="share-card-badge">{slide.badge}</span>
      <canvas
        ref={canvasRef}
        // Size comes from ShareRunCarousel.css (fits the card to the screen);
        // only the aspect ratio is per-slide. The drawn/exported pixels are
        // untouched - this is display size only.
        style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
      />
    </div>
  )
}
