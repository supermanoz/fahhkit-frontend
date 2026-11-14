/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import mailBadgePng from '../assets/ui/icons/mail_icon-256.png'
import mailBadgeWebp128 from '../assets/ui/icons/mail_icon-128.webp'
import mailBadgeWebp256 from '../assets/ui/icons/mail_icon-256.webp'

// The blue round envelope badge - rendered plain, no recolour/filter/
// extra circle behind it (it's already got its own round frame). Used
// for both the "Mail" nav entry (header trigger/dropdown row/desktop
// tab, via TabMedal's bare-render branch for tone 'mail') and the News
// tab/button inside the Mail panel - the same asset, not two copies (see
// MailPanel.jsx). The radial FAB popup's own Mail icon is untouched,
// still IconEnvelope (GameIcons.jsx) - a separate, icon-only context this
// swap was never asked to touch.
// `fill` sizes it to its parent (100%) instead of `size` - used inside the
// tab-row medal ring (GamePage.jsx's TabMedal), where the ring owns the box
// size so Mail can't drift from the other tabs' icons.
export default function MailBadgeIcon({
  size = 28,
  className = '',
  fill = false,
}) {
  const box = fill ? '100%' : size
  return (
    <picture
      style={{
        flexShrink: 0,
        lineHeight: 0,
        ...(fill && { width: '100%', height: '100%', display: 'block' }),
      }}
    >
      <source
        srcSet={`${mailBadgeWebp128} 1x, ${mailBadgeWebp256} 2x`}
        type="image/webp"
      />
      <img
        src={mailBadgePng}
        alt=""
        className={className}
        width={size}
        height={size}
        style={{
          width: box,
          height: box,
          display: 'block',
          borderRadius: fill ? '50%' : undefined,
          objectFit: 'contain',
          imageRendering: 'auto',
        }}
      />
    </picture>
  )
}
