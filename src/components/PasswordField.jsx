/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import './PasswordField.css'

export default function PasswordField({ id, name, value, onChange, ...rest }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        {...rest}
      />
      <button
        type="button"
        className="password-field-toggle"
        onClick={() => setVisible((show) => !show)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <FaEyeSlash /> : <FaEye />}
      </button>
    </div>
  )
}
