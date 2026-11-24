// Drops keyboard focus from whatever text field has it. A focused (or once
// edited) field is what lets iOS's "Shake to Undo" fire its "Undo Typing"
// alert from running motion, so a run must never start/continue with one
// focused. Buttons and other non-text elements are left alone.
export function blurActiveField(
  doc = typeof document !== 'undefined' ? document : null
) {
  const el = doc?.activeElement
  if (!el || el === doc.body) return false
  const isField =
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  if (!isField) return false
  el.blur()
  return true
}
