/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Link } from 'react-router-dom'
import { isNative } from '../utils/geo'
import { openExternal } from '../utils/externalLink'
import { getSiteBaseUrl } from '../utils/siteUrl'
import './TermsAgreement.css'

export default function TermsAgreement({ id, to, checked, onChange }) {
  return (
    <label className="terms-agreement" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        I have read and agree to the{' '}
        {isNative ? (
          // The native app has no /terms route (game only) - the website's
          // page opens in the system browser, never inside the game WebView.
          <a
            href={`${getSiteBaseUrl()}${to}`}
            target="_blank"
            rel="noopener noreferrer"
            className="terms-agreement-link"
            onClick={(e) => openExternal(`${getSiteBaseUrl()}${to}`, e)}
          >
            Terms &amp; Conditions
          </a>
        ) : (
          <Link
            to={to}
            target="_blank"
            rel="noopener noreferrer"
            className="terms-agreement-link"
          >
            Terms &amp; Conditions
          </Link>
        )}
      </span>
    </label>
  )
}
