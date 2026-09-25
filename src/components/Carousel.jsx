/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import './Carousel.css'

export default function Carousel({ slides, intervalMs = 5000 }) {
  const [index, setIndex] = useState(0)
  const timerRef = useRef(null)

  const goTo = useCallback(
    (i) => {
      setIndex(((i % slides.length) + slides.length) % slides.length)
    },
    [slides.length]
  )

  const restartTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, intervalMs)
  }, [slides.length, intervalMs])

  useEffect(() => {
    restartTimer()
    return () => clearInterval(timerRef.current)
  }, [restartTimer])

  function next() {
    goTo(index + 1)
    restartTimer()
  }

  function prev() {
    goTo(index - 1)
    restartTimer()
  }

  function select(i) {
    goTo(i)
    restartTimer()
  }

  return (
    <div
      className="carousel"
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={restartTimer}
    >
      <div
        className="carousel-track"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div className="carousel-slide" key={i}>
            <div
              className="carousel-slide-bg"
              style={{
                background: slide.image
                  ? `url(${slide.image}) center/cover no-repeat`
                  : slide.gradient,
              }}
            />
            <div className="carousel-slide-scrim" />
            <span
              className="carousel-blob carousel-blob-a"
              aria-hidden="true"
            />
            <span
              className="carousel-blob carousel-blob-b"
              aria-hidden="true"
            />
            <div
              className="carousel-content"
              key={i === index ? `active-${index}` : `idle-${i}`}
            >
              {slide.content ? (
                slide.content
              ) : (
                <>
                  {slide.emoji && (
                    <span className="carousel-emoji">{slide.emoji}</span>
                  )}
                  <h2>{slide.title}</h2>
                  <p>{slide.subtitle}</p>
                  {slide.cta}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        className="carousel-arrow prev"
        aria-label="Previous slide"
        onClick={prev}
      >
        <FaChevronLeft />
      </button>
      <button
        className="carousel-arrow next"
        aria-label="Next slide"
        onClick={next}
      >
        <FaChevronRight />
      </button>

      <div className="carousel-dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`carousel-dot ${i === index ? 'active' : ''}`}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => select(i)}
          />
        ))}
      </div>
    </div>
  )
}
