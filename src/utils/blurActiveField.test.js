// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { blurActiveField } from './blurActiveField'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('blurActiveField', () => {
  it('blurs a focused input / textarea', () => {
    for (const tag of ['input', 'textarea']) {
      const el = document.createElement(tag)
      document.body.appendChild(el)
      el.focus()
      expect(document.activeElement).toBe(el)
      expect(blurActiveField()).toBe(true)
      expect(document.activeElement).not.toBe(el)
    }
  })
  it('leaves a focused button alone', () => {
    const b = document.createElement('button')
    document.body.appendChild(b)
    b.focus()
    expect(blurActiveField()).toBe(false)
    expect(document.activeElement).toBe(b)
  })
  it('does nothing when nothing is focused', () => {
    expect(blurActiveField()).toBe(false)
  })
})
