/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import './TeamCarousel.css'

function getPageSize() {
  if (window.innerWidth <= 560) return 1
  if (window.innerWidth <= 800) return 2
  return 3
}

export default function TeamCarousel({ team }) {
  const [pageSize, setPageSize] = useState(getPageSize)
  const [page, setPage] = useState(0)

  useEffect(() => {
    function onResize() {
      setPageSize(getPageSize())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const pageCount = Math.ceil(team.length / pageSize)

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1))
  }, [pageCount])

  function goTo(i) {
    setPage(((i % pageCount) + pageCount) % pageCount)
  }

  return (
    <div className="team-carousel">
      <div className="team-carousel-viewport">
        <div
          className="team-carousel-track"
          style={{ transform: `translateX(-${page * 100}%)` }}
        >
          {Array.from({ length: pageCount }, (_, p) => (
            <div
              className="team-carousel-page"
              key={p}
              style={{ gridTemplateColumns: `repeat(${pageSize}, 1fr)` }}
            >
              {team
                .slice(p * pageSize, p * pageSize + pageSize)
                .map((member) => (
                  <div className="team-card" key={member.name}>
                    <div className="team-card-photo">
                      <img src={member.photo} alt={member.name} />
                    </div>
                    <div className="team-card-body">
                      <h3>{member.name}</h3>
                      <span className="team-card-role">{member.role}</span>
                      <p>{member.bio}</p>
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      {pageCount > 1 && (
        <>
          <button
            className="team-carousel-arrow prev"
            aria-label="Previous team members"
            onClick={() => goTo(page - 1)}
          >
            <FaChevronLeft />
          </button>
          <button
            className="team-carousel-arrow next"
            aria-label="Next team members"
            onClick={() => goTo(page + 1)}
          >
            <FaChevronRight />
          </button>

          <div className="team-carousel-dots">
            {Array.from({ length: pageCount }, (_, p) => (
              <button
                key={p}
                className={`team-carousel-dot ${p === page ? 'active' : ''}`}
                aria-label={`Go to team page ${p + 1}`}
                onClick={() => goTo(p)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
