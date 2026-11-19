/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { memo, useMemo } from 'react'
import { IconCheck, IconLock } from './GameIcons'
import Price from './Price'
import { formatPrice } from '../utils/price'
import {
  colorCardState,
  itemDisplayName,
  rarityOf,
  safeColor,
  sortColorItems,
} from '../utils/shopColors'
import { TerritoryMapPreview, TrailMapPreview } from './shop/ShopMapPreview'
import './ColorShelf.css'

// The Shop's Territory (flag) and Trail shelves: a grid of game-style item
// cards. Each card shows a map preview of the item, its name and ONE clear
// state (price / Get / Owned + Equip / Equipped). The whole card is one
// button that opens the preview sheet (ColorItemSheet.jsx), where the real
// Buy / Get / Equip happens through the same GamePage handlers as before -
// nothing about prices, ownership or the API calls changes here.
function statusText(state, price) {
  switch (state.kind) {
    case 'equipped':
      return 'equipped'
    case 'owned':
      return 'owned, tap to preview'
    case 'free':
      return 'free'
    case 'level-locked':
      return `unlocks at level ${state.level}`
    case 'short':
      return `${formatPrice(price)} Fahhcoin, you need ${formatPrice(state.needMore)} more`
    default:
      return `${formatPrice(price)} Fahhcoin`
  }
}

function CardFooter({ state, price }) {
  switch (state.kind) {
    case 'equipped':
      return (
        <span className="cs-pill is-equipped">
          <IconCheck /> Equipped
        </span>
      )
    case 'owned':
      return (
        <>
          <span className="cs-pill is-owned">Owned</span>
          <span className="cs-act">Equip</span>
        </>
      )
    case 'free':
      return <span className="cs-pill is-get">Get</span>
    case 'level-locked':
      return (
        <span className="cs-pill is-locked">
          <IconLock /> Level {state.level}
        </span>
      )
    case 'short':
      return (
        <>
          <span className="cs-pill is-price is-short">
            <Price amount={price} />
          </span>
          <span className="cs-need">
            Need {formatPrice(state.needMore)} more
          </span>
        </>
      )
    default:
      return (
        <span className="cs-pill is-price">
          <Price amount={price} />
        </span>
      )
  }
}

function ColorCard({ item, kind, state, onSelect }) {
  const name = itemDisplayName(item, kind)
  const rarity = rarityOf(item)
  const price = Number(item.priceFahhcoin) || 0
  const Preview = kind === 'trail' ? TrailMapPreview : TerritoryMapPreview
  return (
    <button
      type="button"
      className={`cs-card is-${rarity} is-${state.kind}`}
      style={{ '--item-color': safeColor(item.colorValue) }}
      onClick={() => onSelect(item)}
      aria-label={`${name} - ${statusText(state, price)}`}
    >
      <span className="cs-frame">
        <span className="cs-window">
          <Preview color={item.colorValue} />
        </span>
        {state.kind === 'equipped' && (
          <span className="cs-check" aria-hidden="true">
            <IconCheck />
          </span>
        )}
      </span>
      <span className="cs-name cs-display">{name}</span>
      <span className="cs-foot">
        <CardFooter state={state} price={price} />
      </span>
    </button>
  )
}

function ColorShelf({
  kind = 'territory',
  title,
  items,
  ownedItems,
  balance = 0,
  level,
  onSelect,
  emptyText = 'Nothing here yet.',
}) {
  const sorted = useMemo(
    () => sortColorItems(items, ownedItems),
    [items, ownedItems]
  )
  return (
    // No visible heading: the Shop's tab buttons already say which shelf this
    // is (the title stays here as the section's accessible name).
    <section className="color-shelf cs-shelf" aria-label={title}>
      {items.length === 0 ? (
        <p className="game-menu-empty">{emptyText}</p>
      ) : (
        <div className="cs-grid">
          {sorted.map((item) => (
            <ColorCard
              key={item.id}
              item={item}
              kind={kind}
              state={colorCardState({ item, ownedItems, balance, level })}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default memo(ColorShelf)
