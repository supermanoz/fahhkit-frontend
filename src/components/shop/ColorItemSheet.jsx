/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { IconCheck, IconClose, IconCoins, IconLock } from '../GameIcons'
import GameButton from '../../game/ui/GameButton'
import StatChip from '../../game/ui/StatChip'
import Price from '../Price'
import { formatPrice } from '../../utils/price'
import {
  EFFECT_LINE,
  colorCardState,
  itemDisplayName,
  rarityOf,
} from '../../utils/shopColors'
import { TerritoryMapPreview, TrailMapPreview } from './ShopMapPreview'
import '../ColorShelf.css'

// The preview sheet for a Territory / Trail item: a larger, animated preview
// (the flag waves / the trail draws itself in), what it does, and the one
// action that fits - Buy, Get, Equip or Equipped - with a success state after
// buying or equipping. The actions call the same GamePage handlers the old
// tap-to-buy / tap-to-equip used (onBuy = handlePurchase, onEquip =
// handleEquip); this component never talks to the API itself.
export default function ColorItemSheet({
  item,
  kind,
  ownedItems,
  balance,
  level,
  purchasing = false,
  purchaseError = null,
  onBuy,
  onEquip,
  onGetCoins,
  onClose,
}) {
  const reduceMotion = useReducedMotion()
  const state = colorCardState({ item, ownedItems, balance, level })
  const name = itemDisplayName(item, kind)
  const price = Number(item.priceFahhcoin) || 0
  const Preview = kind === 'trail' ? TrailMapPreview : TerritoryMapPreview
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  // The success state follows what actually happened: the item's state moved.
  const prev = useRef(state.kind)
  useEffect(() => {
    const before = prev.current
    prev.current = state.kind
    if (before === state.kind) return
    const wasOwned = before === 'owned' || before === 'equipped'
    if (state.kind === 'equipped') setFlash(wasOwned ? 'equipped' : 'bought')
    else if (state.kind === 'owned')
      setFlash(before === 'equipped' ? 'unequipped' : 'bought')
  }, [state.kind])

  // Escape closes the sheet. The listener is added once and reads the latest
  // onClose through a ref: re-subscribing on every render could drop it in the
  // middle of the key event (another Escape handler's re-render runs first).
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function run(fn) {
    if (busy) return
    setFlash(null)
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const loading = busy || purchasing
  const FLASH_TEXT = {
    bought:
      kind === 'trail'
        ? 'Yours now! Equip it below.'
        : 'Yours now! Equip it below.',
    equipped: 'Equipped! You will see it on your next run.',
    unequipped: 'Unequipped.',
  }

  let actions
  if (state.kind === 'level-locked') {
    actions = (
      <GameButton
        variant="secondary"
        size="lg"
        className="g-full-width"
        disabled
        icon={<IconLock />}
      >
        Reach level {state.level} to unlock
      </GameButton>
    )
  } else if (state.kind === 'short') {
    actions = (
      <>
        <p className="cs-short" role="status">
          Not enough Fahhcoin. You have {formatPrice(balance)}, need{' '}
          {formatPrice(state.needMore)} more.
        </p>
        <GameButton
          variant="gold"
          size="lg"
          className="g-full-width"
          onClick={onGetCoins}
        >
          Get Fahhcoin
        </GameButton>
      </>
    )
  } else if (state.kind === 'buy') {
    actions = (
      <GameButton
        variant="success"
        size="lg"
        className="g-full-width"
        loading={loading}
        onClick={() => run(() => onBuy(item))}
      >
        Buy for <Price amount={price} />
      </GameButton>
    )
  } else if (state.kind === 'free') {
    actions = (
      <GameButton
        variant="success"
        size="lg"
        className="g-full-width"
        loading={loading}
        onClick={() => run(() => onBuy(item))}
      >
        Get it free
      </GameButton>
    )
  } else if (state.kind === 'owned') {
    actions = (
      <GameButton
        variant="success"
        size="lg"
        className="g-full-width"
        loading={loading}
        onClick={() => run(() => onEquip(item, false))}
      >
        Equip
      </GameButton>
    )
  } else {
    actions = (
      <>
        <div className="cs-equipped-state" role="status">
          <IconCheck /> Equipped
        </div>
        <GameButton
          variant="secondary"
          size="sm"
          className="cs-unequip"
          loading={loading}
          onClick={() => run(() => onEquip(item, true))}
        >
          Unequip
        </GameButton>
      </>
    )
  }

  return (
    <motion.div
      className="game-confirm-overlay cs-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={`cs-sheet is-${rarityOf(item)}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cs-sheet-title"
        onClick={(e) => e.stopPropagation()}
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, scale: 0.92, y: 10 },
              animate: { opacity: 1, scale: 1, y: 0 },
              exit: { opacity: 0, scale: 0.95 },
              transition: { type: 'spring', stiffness: 420, damping: 28 },
            })}
      >
        <button
          type="button"
          className="game-close-btn cs-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>
        <div className="cs-sheet-preview">
          <Preview color={item.colorValue} animated />
        </div>
        <h2 id="cs-sheet-title" className="cs-sheet-title cs-display">
          {name}
        </h2>
        <p className="cs-sheet-effect">{EFFECT_LINE[kind]}</p>
        <div className="cs-sheet-chips">
          <StatChip
            icon={<IconCoins />}
            label="Price"
            value={price > 0 ? formatPrice(price) : 'Free'}
            tone="gold"
          />
          <StatChip
            icon={<IconCoins />}
            label="Your coins"
            value={formatPrice(balance)}
            tone="gold"
          />
        </div>
        {flash && (
          <p className="cs-flash" role="status">
            <IconCheck /> {FLASH_TEXT[flash]}
          </p>
        )}
        {purchaseError && (
          <p className="cs-error" role="alert">
            {purchaseError}
          </p>
        )}
        <div className="cs-sheet-actions">{actions}</div>
      </motion.div>
    </motion.div>
  )
}
