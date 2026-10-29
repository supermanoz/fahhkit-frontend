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
  { title: 'Ink', tokens: { '--ink': '#0a0f2c' } },
  {
    title: 'Surfaces',
    tokens: {
      '--bg-900': '#0b1026',
      '--bg-800': '#141b3d',
      '--surface-700': '#1e2a5a',
      '--surface-600': '#2a3a78',
      '--line': '#3b4f9a',
    },
  },
  {
    title: 'Frost / white',
    tokens: {
      '--frost-50': '#f7faff',
      '--frost-100': '#eaf2ff',
      '--frost-200': '#d3e3ff',
      '--frost-ink': '#1a2550',
    },
  },
  {
    title: 'Sky (brand + primary)',
    tokens: {
      '--sky-300': '#7fd6ff',
      '--sky-500': '#2fa8ff',
      '--sky-700': '#1673d6',
      '--sky-900': '#0b4a99',
    },
  },
  {
    title: 'Violet (premium)',
    tokens: {
      '--violet-300': '#b79bff',
      '--violet-500': '#7c4dff',
      '--violet-700': '#5229cc',
      '--violet-900': '#331a85',
    },
  },
  {
    title: 'Green (success only)',
    tokens: {
      '--green-300': '#6ef0a6',
      '--green-500': '#22c55e',
      '--green-700': '#15803d',
    },
  },
  {
    title: 'Red (danger only)',
    tokens: {
      '--red-300': '#ff8a96',
      '--red-500': '#ef3b4f',
      '--red-700': '#b3192d',
    },
  },
  {
    title: 'Gold (coins / trophies / rank-1 ONLY)',
    tokens: {
      '--gold-300': '#ffe07a',
      '--gold-500': '#ffc531',
      '--gold-700': '#c98a00',
    },
  },
  {
    title: 'Rarity',
    tokens: {
      '--rarity-common': '#a9b6d6',
      '--rarity-rare': '#2fa8ff',
      '--rarity-epic': '#7c4dff',
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
// for WCAG's "large text" 3:1 threshold (>=18.66px bold) - no stroke/
// mitigation needed anywhere in this table, every pair passes on raw fill
// colour alone.
const CONTRAST_PAIRS = [
  {
    label: 'White body text on bg-900 (page bg)',
    fg: '#ffffff',
    bg: '#0b1026',
    large: false,
  },
  {
    label: 'White body text on bg-800 (panel)',
    fg: '#ffffff',
    bg: '#141b3d',
    large: false,
  },
  {
    label: 'Muted text on bg-800 (panel)',
    fg: '#b6c2e8',
    bg: '#141b3d',
    large: false,
  },
  {
    label: 'Muted text on bg-900 (page bg)',
    fg: '#b6c2e8',
    bg: '#0b1026',
    large: false,
  },
  {
    label: 'Frost-ink text on frost-100 (card)',
    fg: '#1a2550',
    bg: '#f7faff',
    large: false,
  },
  {
    label: 'Gold-300 outlined stat value on bg-800 (44px)',
    fg: '#ffe07a',
    bg: '#141b3d',
    large: true,
  },
  {
    label: 'Ink label on gold-500 (currency pill / ribbon)',
    fg: '#0a0f2c',
    bg: '#ffc531',
    large: false,
  },
  {
    label: 'Ink button label on sky-500 (primary, 20px/700)',
    fg: '#0a0f2c',
    bg: '#2fa8ff',
    large: true,
  },
  {
    label: 'Ink button label on green-500 (success, 20px/700)',
    fg: '#0a0f2c',
    bg: '#22c55e',
    large: true,
  },
  {
    label: 'Ink button label on violet-500 (premium, 20px/700)',
    fg: '#0a0f2c',
    bg: '#7c4dff',
    large: true,
  },
  {
    label: 'White button label on red-500 (danger, 20px/700)',
    fg: '#ffffff',
    bg: '#ef3b4f',
    large: true,
  },
  {
    label: 'Frost-ink secondary button on frost-100',
    fg: '#1a2550',
    bg: '#f7faff',
    large: true,
  },
  {
    label: 'Sky-300 ghost button text on bg-900',
    fg: '#7fd6ff',
    bg: '#0b1026',
    large: false,
  },
  {
    label: 'White active-tab label on sky-700 (gradient anchor)',
    fg: '#ffffff',
    bg: '#1673d6',
    large: false,
  },
  {
    label: 'White active-tab label on violet-700 (premium anchor)',
    fg: '#ffffff',
    bg: '#5229cc',
    large: false,
  },
  {
    label: 'White modal ribbon text on sky-700 (gradient anchor)',
    fg: '#ffffff',
    bg: '#1673d6',
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
          Dev-only reference for every token and shared component in the /game
          re-skin (&quot;Frost &amp; Amethyst&quot;). Not linked from
          navigation. Visible only in development builds.
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
