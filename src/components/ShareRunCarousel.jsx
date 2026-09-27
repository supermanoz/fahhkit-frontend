/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconDownload } from './GameIcons'
import { motion } from 'framer-motion'
import {
  CARD_H,
  CARD_W,
  SHARE_VARIANTS,
  downloadBlob,
  drawShareCard,
  exportShareCardBlob,
} from '../utils/shareCanvas'
import './ShareRunCarousel.css'

const SLIDES = [
  {
    variant: SHARE_VARIANTS.TRANSPARENT,
    label: 'Transparent Route',
    badge: 'PNG',
    ext: 'png',
    mime: 'image/png',
    checkerboard: true,
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
export default function ShareRunCarousel({ run }) {
  const [index, setIndex] = useState(0)
  const [downloadingVariant, setDownloadingVariant] = useState(null)
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

  async function handleDownload(slide) {
    setDownloadingVariant(slide.variant)
    try {
      const blob = await exportShareCardBlob({
        points: run.points,
        distance: run.distance,
        duration: run.duration,
        pace: run.avgPace,
        variant: slide.variant,
        mimeType: slide.mime,
        quality: slide.quality,
      })
      downloadBlob(blob, `fahhkit-run-${run.id}-${slide.variant}.${slide.ext}`)
    } finally {
      setDownloadingVariant(null)
    }
  }

  return (
    <div className="share-carousel glass-card" ref={containerRef}>
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
              <ShareCardPreview run={run} slide={slide} />
              <div className="share-carousel-slide-footer">
                <span className="share-carousel-slide-label">
                  {slide.label}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => handleDownload(slide)}
                  disabled={downloadingVariant === slide.variant}
                >
                  <IconDownload />{' '}
                  {downloadingVariant === slide.variant
                    ? 'Preparing...'
                    : `Download ${slide.ext.toUpperCase()}`}
                </button>
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

function ShareCardPreview({ run, slide }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
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
      variant: slide.variant,
    }).catch(() => {})
  }, [run, slide.variant])

  return (
    <div
      className={`share-card-canvas-wrap${slide.checkerboard ? ' checkerboard' : ''}`}
    >
      <span className="share-card-badge">{slide.badge}</span>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 'auto',
          aspectRatio: `${CARD_W} / ${CARD_H}`,
        }}
      />
    </div>
  )
}
