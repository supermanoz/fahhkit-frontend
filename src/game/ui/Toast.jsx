/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import './components.css'

const ToastContext = createContext(null)
const ICONS = { success: '✓', error: '!', info: 'i' }
const DEFAULT_DURATION = 3500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, { type = 'info', duration = DEFAULT_DURATION } = {}) => {
      const id = idRef.current++
      setToasts((list) => [...list, { id, message, type, duration }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="g-toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const startX = useRef(null)

  function onPointerDown(e) {
    startX.current = e.clientX
  }
  function onPointerUp(e) {
    if (startX.current == null) return
    if (Math.abs(e.clientX - startX.current) > 80) onDismiss()
    startX.current = null
  }

  return (
    <div
      className={`g-toast g-toast-${toast.type}`}
      onClick={onDismiss}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <span className="g-toast-icon" aria-hidden="true">
        {ICONS[toast.type] || ICONS.info}
      </span>
      <span>{toast.message}</span>
      {toast.duration > 0 && (
        <span
          className="g-toast-progress"
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
