/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { Link } from 'react-router-dom'
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
        <Link
          to={to}
          target="_blank"
          rel="noopener noreferrer"
          className="terms-agreement-link"
        >
          Terms &amp; Conditions
        </Link>
      </span>
    </label>
  )
}
