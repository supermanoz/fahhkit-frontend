/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import './CoinAmount.css'
import { formatCoins } from '../utils/format'

// THE Fahhcoin amount text: white digits with a dark outline, the same look as
// the main HUD counter. Every screen that shows an amount (HUD, PvP header and
// results, shop, club treasury) uses this instead of styling its own number.
// `value` is a number (formatted with the app's comma format) or, for a
// pre-formatted/placeholder string such as '—', pass `text`.
export default function CoinAmount({ value, text, className = '', ...rest }) {
  return (
    <span className={`coin-amount ${className}`.trim()} {...rest}>
      {text ?? formatCoins(value ?? 0)}
    </span>
  )
}
