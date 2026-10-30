import { useState } from 'react'
import '../game/styles/tokens.css'
import '../game/styles/fonts.css'
import { useGameFontPreload } from '../game/styles/useFontPreload'
import { contrastRatio, passesAA } from '../game/styles/contrast'
import {
  GameButton,
  Panel,
  Modal,
  Tabs,
  CurrencyPill,
  Badge,
  ListRow,
  Card,
  ProgressBar,
  ToastProvider,
  useToast,
  StatBlock,
  Avatar,
  RarityTile,
  Ribbon,
  Divider,
  IconButton,
  Tooltip,
  Skeleton,
} from '../game/ui'
import RolloutRequestModal from './../components/RolloutRequestModal'
import RolloutRequestedChip from './../components/RolloutRequestedChip'
import './GameStyleGuidePage.css'

// Mirrors src/game/styles/tokens.css - kept here (not read from the CSS) so
// the swatch grid and the automated contrast table both work from one
// source of truth without a CSS-parsing step.
const TOKEN_GROUPS = [
  { title: 'Ink', tokens: { '--ink': '#3d2b1a' } },
  {
    title: 'Loading overlay',
    tokens: {
      '--bg-900': '#0a0806',
    },
  },
  {
    title: 'Panels / rows (wood)',
    tokens: {
      '--panel': '#e0a355',
      '--row': '#a8672c',
      '--divider': '#767a6d',
      '--tab-inactive': '#aeb3a6',
      '--white': '#ffffff',
    },
  },
  {
    title: 'Gold (default action/currency)',
    tokens: {
      '--gold-300': '#ffb15c',
      '--gold-500': '#ff7a29',
      '--gold-700': '#c94a08',
    },
  },
  {
    title: 'Green (success only)',
    tokens: {
      '--green-300': '#a8f0af',
      '--green-500': '#4fc85e',
      '--green-700': '#268a3a',
    },
  },
  {
    title: 'Red (danger only)',
    tokens: {
      '--red-300': '#ffab9e',
      '--red-500': '#ff5a4d',
      '--red-700': '#c72a20',
    },
  },
  {
    title: 'Rarity',
    tokens: {
      '--rarity-common': '#8a8a84',
      '--rarity-rare': '#3a7bd5',
      '--rarity-epic': '#8a4fe0',
      '--rarity-legendary': '#ffc531',
    },
  },
  {
    title: 'Team / territory',
    tokens: {
      '--team-coral': '#ff6b6b',
      '--team-tangerine': '#ff9f43',
      '--team-lime': '#a3e635',
      '--team-emerald': '#2dd4a7',
      '--team-cyan': '#22d3ee',
      '--team-indigo': '#6366f1',
      '--team-magenta': '#e263c9',
      '--team-slate': '#94a3c4',
    },
  },
]

const TYPE_SCALE = [
  ['--text-xs', 13],
  ['--text-sm', 14],
  ['--text-md', 16],
  ['--text-lg', 20],
  ['--text-xl', 24],
  ['--text-2xl', 32],
  ['--text-3xl', 44],
  ['--text-4xl', 64],
]

// Real usage pairs - not every possible combination, the ones the component
// library above actually renders. Buttons/tabs/ribbons are sized and
// weighted (see components.css) specifically so they legitimately qualify
// for WCAG's "large text" 3:1 threshold (>=18.66px bold) where noted.
const CONTRAST_PAIRS = [
  {
    label: 'Ink body text on panel (wood)',
    fg: '#3d2b1a',
    bg: '#e0a355',
    large: false,
  },
  {
    label: 'Ink body text on row (wood-dark)',
    fg: '#3d2b1a',
    bg: '#a8672c',
    large: false,
  },
  {
    label: 'Text-muted on panel (wood)',
    fg: '#6e5a42',
    bg: '#e0a355',
    large: false,
  },
  {
    label: 'White text on bg-900 (loading overlay)',
    fg: '#ffffff',
    bg: '#0a0806',
    large: false,
  },
  {
    label: 'Cream text on bg-900 (loading overlay)',
    fg: '#fff6e6',
    bg: '#0a0806',
    large: false,
  },
  {
    label: 'White outlined stat value on panel (44px)',
    fg: '#ffffff',
    bg: '#e0a355',
    large: true,
  },
  {
    label: 'White label on gold-500 (currency pill / ribbon)',
    fg: '#ffffff',
    bg: '#ff7a29',
    large: false,
  },
  {
    label: 'White button label on gold-500 (primary, 20px/700)',
    fg: '#ffffff',
    bg: '#ff7a29',
    large: true,
  },
  {
    label: 'White button label on green-500 (success, 20px/700)',
    fg: '#ffffff',
    bg: '#4fc85e',
    large: true,
  },
  {
    label: 'White button label on red-500 (danger, 20px/700)',
    fg: '#ffffff',
    bg: '#ff5a4d',
    large: true,
  },
  {
    label: 'Ink secondary button on stone (tab-inactive)',
    fg: '#3d2b1a',
    bg: '#aeb3a6',
    large: true,
  },
  {
    label: 'Gold-300 ghost button text on bg-900',
    fg: '#ffb15c',
    bg: '#0a0806',
    large: false,
  },
  {
    label: 'White active-tab label on gold-700 (gradient anchor)',
    fg: '#ffffff',
    bg: '#c94a08',
    large: false,
  },
  {
    label: 'White active-tab label on green-700 (gradient anchor)',
    fg: '#ffffff',
    bg: '#268a3a',
    large: false,
  },
  {
    label: 'White modal ribbon text on gold-700 (gradient anchor)',
    fg: '#ffffff',
    bg: '#c94a08',
    large: false,
  },
]

// eslint-disable-next-line react/prop-types -- no prop-types dependency in this project
function Swatch({ name, hex }) {
  return (
    <div className="sg-swatch">
      <div className="sg-swatch-chip" style={{ background: hex }} />
      <div className="sg-swatch-name">{name}</div>
      <div className="sg-swatch-hex">{hex}</div>
    </div>
  )
}

function ContrastTable() {
  return (
    <table className="sg-contrast-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Ratio</th>
          <th>Threshold</th>
          <th>AA</th>
        </tr>
      </thead>
      <tbody>
        {CONTRAST_PAIRS.map((pair) => {
          const ratio = contrastRatio(pair.fg, pair.bg)
          const ok = passesAA(ratio, pair.large)
          return (
            <tr key={pair.label} className={ok ? 'sg-pass' : 'sg-fail'}>
              <td>
                <span
                  className="sg-contrast-chip"
                  style={{ background: pair.bg, color: pair.fg }}
                >
                  Aa
                </span>
                {pair.label}
              </td>
              <td className="tabular-nums">{ratio.toFixed(2)}:1</td>
              <td>{pair.large ? '3.0:1 (large)' : '4.5:1 (normal)'}</td>
              <td>{ok ? 'PASS' : 'FAIL'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ToastDemoButtons() {
  const { push } = useToast()
  return (
    <div className="sg-row-wrap">
      <GameButton
        size="sm"
        onClick={() => push('Route synced.', { type: 'info' })}
      >
        Info toast
      </GameButton>
      <GameButton
        size="sm"
        variant="success"
        onClick={() => push('Territory claimed!', { type: 'success' })}
      >
        Success toast
      </GameButton>
      <GameButton
        size="sm"
        variant="danger"
        onClick={() =>
          push('Run invalidated - vehicle speed detected.', { type: 'error' })
        }
      >
        Error toast
      </GameButton>
    </div>
  )
}

function TerritoryPopupDemo() {
  return (
    <Panel className="sg-territory-demo">
      <div className="sg-territory-head">
        <Avatar name="Aryan" size={56} ring="var(--sky-500)" />
        <div>
          <div className="sg-territory-owner text-heading">Aryan</div>
          <div className="sg-territory-caption">120m to start</div>
        </div>
      </div>
      <div className="sg-territory-stats">
        <StatBlock value="6.20 km²" label="Held" />
        <StatBlock value={312} label="Run score" />
      </div>
      <GameButton variant="primary" className="sg-full">
        Run This Territory
      </GameButton>
      <GameButton variant="ghost" size="sm" className="sg-full">
        View Profile
      </GameButton>
    </Panel>
  )
}

function PodiumDemo() {
  const podium = [
    { name: 'Manoj', score: '1.47 km²', place: 2 },
    { name: 'Aryan', score: '6.20 km²', place: 1 },
    { name: 'You', score: '0.44 km²', place: 3 },
  ]
  return (
    <Panel className="sg-podium-demo">
      <div className="sg-podium-row">
        {podium.map((p) => (
          <div key={p.name} className={`sg-podium-slot sg-podium-${p.place}`}>
            {p.place === 1 && (
              <span className="sg-crown" aria-hidden="true">
                👑
              </span>
            )}
            <Avatar
              name={p.name}
              size={p.place === 1 ? 64 : 48}
              ring="var(--gold-500)"
              level={p.place}
            />
            <div className="text-heading">{p.name}</div>
            <div className="sg-podium-plinth">{p.place}</div>
            <div className="sg-podium-score">{p.score}</div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default function GameStyleGuidePage() {
  useGameFontPreload()
  const [tab, setTab] = useState('players')
  const [modalOpen, setModalOpen] = useState(false)
  const [premiumModalOpen, setPremiumModalOpen] = useState(false)
  const [progress, setProgress] = useState(62)
  const [rolloutOpen, setRolloutOpen] = useState(false)
  const [rolloutDemo, setRolloutDemo] = useState({
    submitting: false,
    submitError: null,
    justRequested: false,
  })

  return (
    <ToastProvider>
      <div className="game-root sg-page">
        <h1 className="text-outlined">Run Conquest - Style Guide</h1>
        <p className="sg-intro">
          Dev-only reference for every token and shared component in /game
          (original wood/gold palette). Not linked from navigation. Visible only
          in development builds.
        </p>

        <section>
          <h2>Tokens</h2>
          {TOKEN_GROUPS.map((group) => (
            <div key={group.title} className="sg-group">
              <h3>{group.title}</h3>
              <div className="sg-swatch-row">
                {Object.entries(group.tokens).map(([name, hex]) => (
                  <Swatch key={name} name={name} hex={hex} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section>
          <h2>Typography</h2>
          <h3>Display - Fredoka 500/600/700</h3>
          {TYPE_SCALE.map(([name, px]) => (
            <div
              key={name}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: px,
              }}
            >
              {name} / {px}px - Run Conquest
            </div>
          ))}
          <h3>Body - Nunito 600/700/800</h3>
          {TYPE_SCALE.map(([name, px]) => (
            <div
              key={name}
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 700,
                fontSize: px,
              }}
            >
              {name} / {px}px - Claim your turf
            </div>
          ))}
          <h3>Tabular numbers (score, distance, time, pace, coins)</h3>
          <div
            className="tabular-nums"
            style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}
          >
            1,234.5 km² · 00:12:04 · 1,860
          </div>
        </section>

        <section>
          <h2>GameButton</h2>
          {[
            'primary',
            'success',
            'premium',
            'danger',
            'secondary',
            'ghost',
          ].map((variant) => (
            <div key={variant} className="sg-row-wrap">
              <GameButton variant={variant}>Default</GameButton>
              <GameButton variant={variant} className="gb-demo-hover">
                Hover
              </GameButton>
              <GameButton variant={variant} className="gb-demo-active">
                Pressed
              </GameButton>
              <GameButton variant={variant} disabled>
                Disabled
              </GameButton>
              <GameButton variant={variant} loading>
                Loading
              </GameButton>
            </div>
          ))}
          <div className="sg-row-wrap">
            <GameButton size="sm">Small</GameButton>
            <GameButton size="md">Medium</GameButton>
            <GameButton size="lg">Large</GameButton>
          </div>
          <p className="sg-note">
            Known gap: gb-sm + variant=&quot;premium&quot; falls below the
            large-text AA exemption (16px ink on violet-500 is 3.90:1, needs
            4.5:1 at that size) - avoid that combination; md/lg are fine.
          </p>
        </section>

        <section>
          <h2>Panel &amp; Modal</h2>
          <Panel className="sg-panel-demo">
            A plain panel - bg-800 body, surface-700 inset border.
          </Panel>
          <div className="sg-row-wrap">
            <GameButton onClick={() => setModalOpen(true)}>
              Open modal (sky)
            </GameButton>
            <GameButton
              variant="premium"
              onClick={() => setPremiumModalOpen(true)}
            >
              Open modal (premium)
            </GameButton>
          </div>
          {modalOpen && (
            <Modal title="Announcement" onClose={() => setModalOpen(false)}>
              Sky ribbon, red round close button overlapping the corner,
              scale+fade entrance.
            </Modal>
          )}
          {premiumModalOpen && (
            <Modal
              title="Special Offer"
              premium
              onClose={() => setPremiumModalOpen(false)}
            >
              Violet ribbon for premium-context modals.
            </Modal>
          )}
        </section>

        <section>
          <h2>Tabs</h2>
          <Tabs
            ariaLabel="Leaderboard scope"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'players', label: 'Players' },
              { id: 'clubs', label: 'Clubs', badge: 3 },
            ]}
          />
          <div className="sg-spacer" />
          <Tabs
            ariaLabel="Club Wars scope (premium)"
            premium
            value="wars"
            onChange={() => {}}
            tabs={[
              { id: 'wars', label: 'Club Wars' },
              { id: 'history', label: 'History' },
            ]}
          />
        </section>

        <section>
          <h2>CurrencyPill</h2>
          <div className="sg-row-wrap">
            <CurrencyPill icon="🪙" value={1360} />
            <CurrencyPill icon="💎" value={42} onAdd={() => {}} />
          </div>
        </section>

        <section>
          <h2>Badge</h2>
          <div className="sg-row-wrap">
            <Badge kind="count">3</Badge>
            <Badge kind="level">7</Badge>
            <Badge kind="new">NEW</Badge>
          </div>
        </section>

        <section>
          <h2>ListRow &amp; Card</h2>
          <ListRow variant="dark" chevron onClick={() => {}}>
            Dark row, chevron
          </ListRow>
          <ListRow variant="dark" selected chevron onClick={() => {}}>
            Selected (sky left accent)
          </ListRow>
          <ListRow variant="frost" chevron onClick={() => {}}>
            Frost row
          </ListRow>
          <Card variant="dark" className="sg-card-spacing">
            A dark card.
          </Card>
          <Card variant="frost" className="sg-card-spacing">
            A frost card.
          </Card>
        </section>

        <section>
          <h2>ProgressBar</h2>
          <ProgressBar value={progress} color="sky" label={`${progress}%`} />
          <ProgressBar value={80} color="green" />
          <ProgressBar value={45} color="gold" />
          <GameButton
            size="sm"
            variant="ghost"
            onClick={() => setProgress((p) => (p >= 100 ? 10 : p + 15))}
          >
            Advance
          </GameButton>
        </section>

        <section>
          <h2>Toast</h2>
          <ToastDemoButtons />
        </section>

        <section>
          <h2>StatBlock</h2>
          <div className="sg-row-wrap">
            <StatBlock value={1860} label="Coins" gold />
            <StatBlock value="0.444 km²" label="Territory" />
            <StatBlock value="12:04" label="Pace" />
          </div>
        </section>

        <section>
          <h2>Avatar</h2>
          <div className="sg-row-wrap">
            <Avatar name="Aryan" size={56} />
            <Avatar name="Nova" size={56} ring="var(--sky-500)" level={7} />
            <Avatar
              src="/does-not-exist.png"
              name="Fallback Test"
              size={56}
              ring="var(--team-emerald)"
            />
          </div>
        </section>

        <section>
          <h2>RarityTile</h2>
          <div className="sg-row-wrap">
            <RarityTile rarity="common" icon="A" />
            <RarityTile rarity="rare" icon="B" />
            <RarityTile rarity="epic" icon="C" equipped />
            <RarityTile rarity="legendary" icon="D" isNew />
            <RarityTile rarity="epic" icon="E" locked />
          </div>
        </section>

        <section>
          <h2>Ribbon, Divider, IconButton, Tooltip, Skeleton</h2>
          <div className="sg-row-wrap">
            <Ribbon>SEASON 3</Ribbon>
            <Ribbon className="g-ribbon-gold">#1 TROPHY</Ribbon>
          </div>
          <Divider />
          <div className="sg-row-wrap">
            <IconButton icon="⚙" label="Settings" />
            <Tooltip label="Opens settings">
              <IconButton icon="?" label="Help" />
            </Tooltip>
          </div>
          <Skeleton width={200} height={20} />
        </section>

        <section>
          <h2>Composed screens</h2>
          <div className="sg-composed-row">
            <TerritoryPopupDemo />
            <PodiumDemo />
          </div>
        </section>

        <section>
          <h2>Request Rollout (Task 2)</h2>
          <div className="sg-row-wrap">
            <GameButton
              onClick={() => {
                setRolloutDemo({
                  submitting: false,
                  submitError: null,
                  justRequested: false,
                })
                setRolloutOpen(true)
              }}
            >
              Open rollout popup
            </GameButton>
          </div>
          {rolloutOpen && (
            <RolloutRequestModal
              cityName="Pokhara"
              countryName="Nepal"
              requestCount={214}
              submitting={rolloutDemo.submitting}
              submitError={rolloutDemo.submitError}
              justRequested={rolloutDemo.justRequested}
              onDismiss={() => setRolloutOpen(false)}
              onRequest={() => {
                setRolloutDemo({
                  submitting: true,
                  submitError: null,
                  justRequested: false,
                })
                setTimeout(() => {
                  setRolloutDemo({
                    submitting: false,
                    submitError: null,
                    justRequested: true,
                  })
                }, 900)
              }}
            />
          )}
          <h3>Already-requested chip (Settings)</h3>
          <div style={{ maxWidth: 360 }}>
            <RolloutRequestedChip cityName="Pokhara" countryName="Nepal" />
          </div>
        </section>

        <section>
          <h2>Automated WCAG AA contrast table</h2>
          <ContrastTable />
        </section>
      </div>
    </ToastProvider>
  )
}
