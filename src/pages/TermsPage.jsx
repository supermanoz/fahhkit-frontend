import { Link, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { TERMS_PAGES } from '../constants/terms'
import './TermsPage.css'

export default function TermsPage() {
  const { type } = useParams()
  const page = TERMS_PAGES[type]

  return (
    <div className="terms-page">
      <Navbar />
      <div className="terms-page-wrap">
        <span className="blob auth-blob-a" aria-hidden="true" />
        <span className="blob auth-blob-b" aria-hidden="true" />
        <div className="terms-page-card glass-card" data-aos="fade-up">
          {page ? (
            <>
              <header className="terms-page-header">
                <div className="terms-page-logo">📜</div>
                <h1>{page.title}</h1>
                <p>{page.intro}</p>
              </header>
              <ol className="terms-page-list">
                {page.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            </>
          ) : (
            <header className="terms-page-header">
              <h1>Terms & Conditions</h1>
              <p>We couldn&apos;t find the terms you&apos;re looking for.</p>
            </header>
          )}
          <Link to="/" className="btn btn-outline btn-block">
            Back to Home
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}
