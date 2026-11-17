/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useState } from 'react'
import { EXPORT_STATE, useExportAction } from '../hooks/useExportAction'
import { IconDownload } from './GameIcons'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

// A Download / Share button with built-in loading, success and error states
// (see useExportAction). Fixed min-height and a same-size icon slot keep the
// layout from jumping between states.
export default function ExportButton({
  run,
  idleLabel,
  loadingLabel,
  icon = <IconDownload />,
  className,
  onNotify,
  timeoutMs,
  testId,
  children,
}) {
  const { state, message, permissionDenied, trigger, loading } =
    useExportAction(run, { onNotify, timeoutMs })
  const reduced = usePrefersReducedMotion()

  let label = idleLabel
  let glyph = icon
  if (state === EXPORT_STATE.LOADING) {
    label = loadingLabel
    glyph = reduced ? (
      <span className="export-btn-dots" aria-hidden="true">
        ...
      </span>
    ) : (
      <span className="export-btn-spinner" aria-hidden="true" />
    )
  } else if (state === EXPORT_STATE.SUCCESS) {
    label = message
    glyph = <span aria-hidden="true">✓</span>
  } else if (state === EXPORT_STATE.ERROR) {
    label = message
    glyph = <span aria-hidden="true">✕</span>
  }

  return (
    <>
      <button
        type="button"
        className={`${className} export-btn export-btn--${state}`}
        onClick={trigger}
        disabled={loading}
        aria-busy={loading}
        data-state={state}
        data-testid={testId}
      >
        <span className="export-btn-icon">{glyph}</span>
        <span className="export-btn-label" aria-live="polite">
          {label}
        </span>
      </button>
      {children?.({ permissionDenied })}
    </>
  )
}
