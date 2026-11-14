/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { formatPrice } from '../utils/price'

// Every Fahhcoin price in the game: the number (formatted like the HUD
// balance) followed by the coin icon. `data-price` carries the raw amount.
export default function Price({ amount, className = '' }) {
  return (
    <span
      className={`price ${className}`.trim()}
      data-testid="price"
      data-price={Number(amount) || 0}
      aria-label={`${formatPrice(amount)} Fahhcoin`}
    >
      {formatPrice(amount)}
      <span className="game-coin" aria-hidden="true" />
    </span>
  )
}

// "Unlock for 5,000 [coin]" built from real elements + flex gap (never string
// concatenation: a flex button collapses the space before an inline child).
export function PriceLabel({ label, amount }) {
  return (
    <span className="price-label">
      <span>{label}</span>
      <Price amount={amount} />
    </span>
  )
}
