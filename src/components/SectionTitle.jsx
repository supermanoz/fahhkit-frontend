/* eslint-disable react/prop-types -- no prop-types dependency in this project */
export default function SectionTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="section-title-block" data-aos="fade-up">
      {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
      <h2 className="section-heading">{title}</h2>
      {subtitle && <p className="section-sub">{subtitle}</p>}
    </div>
  )
}
