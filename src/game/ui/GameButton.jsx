/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import UiGameButton from '../../components/ui/GameButton'

// Legacy entry point kept so existing imports keep working: it now just maps the
// old variant names onto the one shared button (components/ui/GameButton) and
// keeps the old tap sound. New code should import components/ui/GameButton.
const VARIANT = {
  primary: 'primary',
  success: 'primary',
  premium: 'primary',
  danger: 'danger',
  gold: 'gold',
  accent: 'accent',
  secondary: 'neutral',
  ghost: 'neutral',
}

export default function GameButton({ variant = 'primary', ...rest }) {
  return (
    <UiGameButton variant={VARIANT[variant] || 'primary'} sound {...rest} />
  )
}
