/* eslint-disable react/prop-types -- no prop-types dependency in this project */
import { IconCheck } from './GameIcons'

// A Shop shelf of colour items (Territory Colors, Trail Colors): the same
// Dota-style packed tile grid as the heroes, each tile a preview drawn by
// `Preview` in that item's colour. No names - the colour speaks for itself;
// the price (or Owned / equipped tick) sits bottom-right. Tap: buy if not
// owned, else equip/unequip.
export default function ColorShelf({
  title,
  Icon,
  items,
  ownedItems,
  Preview,
  onBuy,
  onEquip,
  emptyText = 'Nothing here yet.',
}) {
  return (
    <section className="color-shelf">
      <p className="game-menu-avatars-title game-menu-avatars-title-centered">
        {Icon && <Icon />} {title}
      </p>
      {items.length === 0 ? (
        <p className="game-menu-empty">{emptyText}</p>
      ) : (
        <div className="shade-shop-grid">
          {items.map((item) => {
            const owned = ownedItems.find((o) => o.storeItem.id === item.id)
            const status = owned
              ? owned.equipped
                ? 'equipped, tap to unequip'
                : 'owned, tap to equip'
              : item.priceFahhcoin > 0
                ? `buy for ${item.priceFahhcoin} Fahhcoin`
                : 'free'
            return (
              <button
                key={item.id}
                type="button"
                className={`shade-tile ${owned?.equipped ? 'is-equipped' : owned ? 'is-owned' : ''}`}
                style={{ '--shade': item.colorValue || '#ff7a29' }}
                onClick={() =>
                  owned ? onEquip(item, owned.equipped) : onBuy(item)
                }
                aria-label={`${item.name} - ${status}`}
                title={item.name}
              >
                <Preview color={item.colorValue} />
                <span className="shade-tile-shine" aria-hidden="true" />
                <span className="shade-tile-chip">
                  {owned ? (
                    owned.equipped ? (
                      <>
                        <IconCheck /> On
                      </>
                    ) : (
                      'Owned'
                    )
                  ) : item.priceFahhcoin > 0 ? (
                    <>
                      <span className="game-coin" aria-hidden="true" />
                      {item.priceFahhcoin}
                    </>
                  ) : (
                    'Free'
                  )}
                </span>
                <span className="shade-tile-hint">
                  {owned ? (owned.equipped ? 'Unequip' : 'Equip') : 'Buy'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
