/* eslint-disable react/prop-types -- tiny infrastructure component */
import { Component } from 'react'
import { logClientError } from '../utils/globalErrors'

// Catches render/lifecycle errors below it so one broken screen can't blank the
// whole app. `fallback` (node or fn(reset)) overrides the default card. Never
// logs props/state - only the error name/message and component stack.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logClientError(`boundary:${this.props.name || 'app'}`, error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    const { fallback } = this.props
    if (typeof fallback === 'function') return fallback(this.reset)
    if (fallback) return fallback
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#14141f',
          color: '#fff',
          textAlign: 'center',
          zIndex: 99999,
        }}
      >
        <div style={{ maxWidth: 320 }}>
          <h2 style={{ margin: '0 0 8px' }}>Something tripped us up</h2>
          <p style={{ margin: '0 0 16px', opacity: 0.8 }}>
            Your run data is safe. Reload to jump back in.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: 0,
              background: '#3fc15a',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
