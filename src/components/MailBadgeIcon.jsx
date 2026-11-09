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
export default function MailBadgeIcon({ size = 28, className = '' }) {
  return (
    <picture style={{ flexShrink: 0, lineHeight: 0 }}>
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
          width: size,
          height: size,
          display: 'block',
          objectFit: 'contain',
          imageRendering: 'auto',
        }}
      />
    </picture>
  )
}
