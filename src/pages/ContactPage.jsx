import { useState } from 'react'
import {
  FaMapMarkerAlt,
  FaPhoneAlt,
  FaEnvelope,
  FaClock,
  FaWhatsapp,
} from 'react-icons/fa'
import { postJson, ApiError } from '../api/client'
import {
  EMAIL_PATTERN,
  EMAIL_TITLE,
  NAME_PATTERN,
  NAME_TITLE,
  PHONE_PATTERN,
  PHONE_TITLE,
} from '../constants/validation'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import SectionTitle from '../components/SectionTitle'
import './ContactPage.css'

const INITIAL_FORM = {
  fullName: '',
  email: '',
  mobileNumber: '',
  subject: '',
  message: '',
}

const WHATSAPP_COMMUNITY_URL =
  'https://chat.whatsapp.com/HZWIDpw5yJk70mxWej5M6q?mode=gi_t'

// TODO: replace with real details when available
const CONTACT_DETAILS = [
  { icon: FaMapMarkerAlt, label: 'Address', value: 'Naxal, Kathmandu, Nepal' },
  { icon: FaPhoneAlt, label: 'Phone', value: '+977-9813121465' },
  { icon: FaEnvelope, label: 'Email', value: 'admin@cafebizarre.com.np' },
  { icon: FaClock, label: 'Hours', value: 'Mon - Friday, 9am - 6pm' },
]

export default function ContactPage() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState(null)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBanner(null)
    if (!e.target.reportValidity()) return

    setSubmitting(true)
    try {
      await postJson('/v1/email/send-collaboration-mail', form)
      setForm(INITIAL_FORM)
      setBanner({
        kind: 'success',
        message: "Thanks for reaching out! We'll get back to you soon.",
      })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not send your message. Please try again.'
      setBanner({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="contact-page">
      <Navbar />
      <div className="contact-wrap">
        <div className="section-inner">
          <SectionTitle
            eyebrow="We'd Love to Hear From You"
            title="Get In Touch"
            subtitle="Questions, feedback, or partnership ideas — reach out and the team will get back to you."
          />

          <div className="contact-grid">
            <div className="contact-info glass-card" data-aos="fade-up">
              <h3>Contact Details</h3>
              <ul className="contact-details-list">
                {CONTACT_DETAILS.map(({ icon: Icon, label, value }) => (
                  <li key={label}>
                    <Icon />
                    <div>
                      <span className="contact-detail-label">{label}</span>
                      <span className="contact-detail-value">{value}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="contact-form-card glass-card"
              data-aos="fade-up"
              data-aos-delay="100"
            >
              <h3>Send Us a Message</h3>

              {banner && (
                <div className={`banner ${banner.kind}`}>{banner.message}</div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="fullName">Full Name</label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    pattern={NAME_PATTERN}
                    title={NAME_TITLE}
                    value={form.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      pattern={EMAIL_PATTERN}
                      title={EMAIL_TITLE}
                      autoComplete="email"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mobileNumber">Mobile Number</label>
                    <input
                      id="mobileNumber"
                      name="mobileNumber"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="98XXXXXXXX"
                      pattern={PHONE_PATTERN}
                      title={PHONE_TITLE}
                      value={form.mobileNumber}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="subject">Subject</label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    value={form.subject}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={submitting}
                >
                  {submitting ? 'Sending...' : 'Get In Touch'}
                </button>
              </form>
            </div>
          </div>
        </div>

        <section className="whatsapp-band">
          <span className="blob whatsapp-blob-a" aria-hidden="true" />
          <span className="blob whatsapp-blob-b" aria-hidden="true" />
          <div className="section-inner whatsapp-inner" data-aos="zoom-in">
            <div>
              <h2>Join Our WhatsApp Community</h2>
              <p>
                Connect with like-minded wellness enthusiasts, get exclusive
                tips and stay updated with our latest events
              </p>
            </div>
            <a
              href={WHATSAPP_COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-lg"
            >
              <FaWhatsapp /> Join Our WhatsApp Community
            </a>
          </div>
        </section>
      </div>
      <Footer />
    </div>
  )
}
