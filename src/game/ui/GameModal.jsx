/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import './gameSkin.css'

// Shared popup kit for /game: GamePanel (layered surface), TitleRibbon
// (coloured banner overlapping a panel's top), GameModal (backdrop + panel +
// ribbon + actions, pop-in), GameSheet (same, docked to the bottom) and
// StatChip (icon + big number + small label). All skin lives in
// gameSkin.css; buttons are the existing GameButton / .game-btn family,
// restyled there.
//
// tone -> ribbon colour: info (shop purple) | success (green) |
// warning (amber) | danger (red).

export function GamePanel({ tone, className = '', children, ...rest }) {
  return (
    <div className={`gm-panel ${className}`} data-tone={tone} {...rest}>
      <div className="gm-panel-inner">{children}</div>
    </div>
  )
}

export function TitleRibbon({ tone = 'info', children, className = '' }) {
  return (
    <div className={`gm-ribbon gm-tone-${tone} ${className}`}>
      <span className="gm-ribbon-text">{children}</span>
    </div>
  )
}

export function StatChip({ icon = null, value, label, className = '' }) {
  return (
    <div className={`gm-stat ${className}`}>
      {icon && (
        <span className="gm-stat-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="gm-stat-value">{value}</span>
      <span className="gm-stat-label">{label}</span>
    </div>
  )
}

export function StatRow({ children, className = '' }) {
  return <div className={`gm-stat-row ${className}`}>{children}</div>
}

export function GameActions({ children, stacked = false }) {
  return (
    <div className={`gm-actions${stacked ? ' is-stacked' : ''}`}>
      {children}
    </div>
  )
}

function useEscape(onClose, active) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') ref.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active])
}

// Controlled by `open` so it can animate out (AnimatePresence lives here).
function Layer({
  open,
  onClose,
  sheet,
  tone,
  title,
  className,
  children,
  labelledBy,
  overlayClassName = '',
}) {
  const reduced = useReducedMotion()
  useEscape(onClose, open)
  const cardMotion = sheet
    ? {
        initial: { y: reduced ? 0 : 60, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: reduced ? 0 : 40, opacity: 0 },
        transition: reduced
          ? { duration: 0.01 }
          : { type: 'spring', damping: 24, stiffness: 340 },
      }
    : {
        initial: { scale: reduced ? 1 : 0.86, opacity: 0, y: reduced ? 0 : 12 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: reduced ? 1 : 0.94, opacity: 0 },
        // Slight overshoot on the pop-in.
        transition: reduced
          ? { duration: 0.01 }
          : { type: 'spring', damping: 14, stiffness: 320, mass: 0.8 },
      }
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`gm-overlay${sheet ? ' is-sheet' : ''} ${overlayClassName}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.01 : 0.18 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? labelledBy : undefined}
            className={`gm-panel gm-dialog${sheet ? ' is-sheet' : ''} ${className}`}
            data-tone={tone}
            onClick={(e) => e.stopPropagation()}
            {...cardMotion}
          >
            {title && (
              <TitleRibbon tone={tone}>
                <span id={labelledBy}>{title}</span>
              </TitleRibbon>
            )}
            <div className={`gm-panel-inner${title ? ' has-ribbon' : ''}`}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function GameModal({
  open = true,
  onClose,
  tone = 'info',
  title,
  className = '',
  overlayClassName = '',
  children,
}) {
  return (
    <Layer
      open={open}
      onClose={onClose}
      sheet={false}
      tone={tone}
      title={title}
      className={className}
      overlayClassName={overlayClassName}
      labelledBy="gm-title"
    >
      {children}
    </Layer>
  )
}

export function GameSheet(props) {
  return (
    <Layer
      open={props.open ?? true}
      onClose={props.onClose}
      sheet
      tone={props.tone || 'info'}
      title={props.title}
      className={props.className || ''}
      overlayClassName={props.overlayClassName || ''}
      labelledBy="gm-sheet-title"
    >
      {props.children}
    </Layer>
  )
}
