// Finds GameButtons whose 3D drop shadow (painted BELOW the box) is cut by a
// clipping ancestor: overflow hidden/clip (compared with its box) or a
// scroller (compared with the end of its scrollable content, because
// box-shadow never adds scrollable overflow).
export async function clippedGameButtons(page) {
  return page.evaluate(() => {
    const out = []
    for (const b of document.querySelectorAll('.gbtn')) {
      const r = b.getBoundingClientRect()
      if (!r.width || !r.height) continue
      const cs = getComputedStyle(b)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const drop = parseFloat(cs.getPropertyValue('--b-drop')) || 3
      const shadowBottom = r.bottom + drop
      for (
        let el = b.parentElement;
        el && el !== document.body;
        el = el.parentElement
      ) {
        const s = getComputedStyle(el)
        if (/(visible)/.test(s.overflowY)) continue
        const a = el.getBoundingClientRect()
        const scroller =
          /(auto|scroll)/.test(s.overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        const limit = scroller
          ? a.top + el.clientTop + el.scrollHeight - el.scrollTop
          : a.bottom - parseFloat(s.borderBottomWidth || 0)
        // Only buttons that are (at least partly) inside the container count.
        if (r.top >= a.bottom || r.bottom <= a.top) continue
        if (shadowBottom > limit + 0.5) {
          out.push({
            label: (b.textContent || b.getAttribute('aria-label') || '')
              .trim()
              .slice(0, 30),
            by: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`,
            cutPx: +(shadowBottom - limit).toFixed(1),
          })
          break
        }
      }
    }
    return out
  })
}
