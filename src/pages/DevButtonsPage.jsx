/* eslint-disable react/prop-types -- dev-only preview, no prop-types dependency */
import { useState } from 'react'
import GameButton from '../components/ui/GameButton'
import {
  IconClose,
  IconSettings,
  IconFlag,
  IconStore,
} from '../components/GameIcons'
import '../game/styles/tokens.css'
import './GamePage.css'
import '../components/GameCards.css'

// Dev-only visual review of the shared GameButton (route: /dev/buttons, only
// mounted when import.meta.env.DEV - see App.jsx). Every variant, size and
// state on a dark map-like surface and on a light panel.
const VARIANTS = ['primary', 'accent', 'gold', 'danger', 'neutral']
const SIZES = ['sm', 'md', 'lg']

function Grid({ title, children }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3
        style={{ margin: '0 0 8px', font: '700 12px sans-serif', opacity: 0.7 }}
      >
        {title}
      </h3>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {children}
      </div>
    </section>
  )
}

function Surface({ dark }) {
  const [tab, setTab] = useState('a')
  return (
    <div
      style={{
        flex: '1 1 320px',
        minWidth: 0,
        padding: 16,
        borderRadius: 14,
        background: dark ? '#0b1020' : '#f6f5ef',
        color: dark ? '#fff' : '#2b2a24',
      }}
    >
      <h2 style={{ margin: '0 0 12px', font: '700 15px sans-serif' }}>
        {dark ? 'Dark map' : 'Light panel'}
      </h2>
      {SIZES.map((s) => (
        <Grid key={s} title={`size ${s}`}>
          {VARIANTS.map((v) => (
            <GameButton key={v} variant={v} size={s}>
              {v}
            </GameButton>
          ))}
        </Grid>
      ))}
      <Grid title="icon left">
        <GameButton icon={<IconFlag />}>Conquer</GameButton>
        <GameButton variant="gold" icon={<IconStore />}>
          Buy
        </GameButton>
      </Grid>
      <Grid title="icon-only round">
        <GameButton iconOnly variant="danger" aria-label="Close">
          <IconClose />
        </GameButton>
        <GameButton iconOnly variant="neutral" aria-label="Settings">
          <IconSettings />
        </GameButton>
      </Grid>
      <Grid title="states: pressed is :active, hover desktop only">
        <GameButton disabled>Disabled</GameButton>
        <GameButton variant="gold" disabled>
          Disabled
        </GameButton>
        <GameButton loading>Loading</GameButton>
        <GameButton variant="neutral" loading>
          Loading
        </GameButton>
      </Grid>
      <Grid title="tabs / segmented (selected = filled)">
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          {['a', 'b', 'c'].map((t) => (
            <GameButton
              key={t}
              variant="tab"
              selected={tab === t}
              onClick={() => setTab(t)}
            >
              Tab {t.toUpperCase()}
            </GameButton>
          ))}
        </div>
      </Grid>
      <Grid title="full width + long label (ellipsis, never wraps)">
        <GameButton fullWidth size="lg">
          Claim your reward right now
        </GameButton>
        <div style={{ width: 140 }}>
          <GameButton fullWidth variant="accent">
            A very long label that must not overflow
          </GameButton>
        </div>
        <GameButton as="a" href="#link" variant="neutral">
          Link button
        </GameButton>
      </Grid>
    </div>
  )
}

export default function DevButtonsPage() {
  return (
    <div
      className="game-root game-page"
      style={{
        position: 'static',
        minHeight: '100vh',
        padding: 12,
        overflow: 'auto',
        height: 'auto',
      }}
    >
      <h1
        style={{
          font: '700 18px sans-serif',
          margin: '0 0 12px',
          color: '#fff',
        }}
      >
        GameButton preview
      </h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Surface dark />
        <Surface />
      </div>
    </div>
  )
}
