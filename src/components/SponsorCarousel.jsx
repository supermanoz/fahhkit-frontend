import SectionTitle from './SectionTitle'
import './SponsorCarousel.css'
import sponsor1 from '../assets/images/sponsors/Image.jfif'
import sponsor3 from '../assets/images/sponsors/Image (2).jfif'
import sponsor4 from '../assets/images/sponsors/Image (3).jfif'
import sponsor5 from '../assets/images/sponsors/Image (4).jfif'
import sponsor6 from '../assets/images/sponsors/Image (5).jfif'
import sponsor7 from '../assets/images/sponsors/Image (6).jfif'
import sponsor8 from '../assets/images/sponsors/Image (7).jfif'

const SPONSORS = [
  sponsor1,
  sponsor3,
  sponsor4,
  sponsor5,
  sponsor6,
  sponsor7,
  sponsor8,
]

export default function SponsorCarousel() {
  const track = [...SPONSORS, ...SPONSORS]

  return (
    <section className="sponsors">
      <div className="section-inner">
        <SectionTitle
          eyebrow="Our Partners"
          title="Trusted by Leading Brands"
        />
      </div>
      <div className="sponsors-track-wrap">
        <div className="sponsors-track">
          {track.map((src, i) => (
            <div className="sponsor-card" key={i}>
              <img
                loading="lazy"
                decoding="async"
                src={src}
                alt="Partner logo"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
