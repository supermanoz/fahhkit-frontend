import { describe, expect, it } from 'vitest'
import { EMAIL_PATTERN, NAME_PATTERN, PHONE_PATTERN } from './validation'

// These patterns back both the website's RegisterPage and the new in-game
// GameSignUpScreen (same `pattern="..."` attributes, by design - see
// GameSignUpScreen.jsx) - exercised directly here since there's no
// jsdom/testing-library in this project to render either form (see
// vitest.config.js's `environment: 'node'`).
describe('EMAIL_PATTERN', () => {
  const regex = new RegExp(EMAIL_PATTERN)

  it('accepts a normal address', () => {
    expect(regex.test('sita@gmail.com')).toBe(true)
  })

  it('rejects an address missing a domain ending (browser type="email" would accept this)', () => {
    expect(regex.test('sita@gmail')).toBe(false)
  })

  it('rejects an address with no @', () => {
    expect(regex.test('sitagmail.com')).toBe(false)
  })
})

describe('PHONE_PATTERN', () => {
  const regex = new RegExp(PHONE_PATTERN)

  it('accepts a 10-digit number starting with 9', () => {
    expect(regex.test('9812345678')).toBe(true)
  })

  it('rejects a number not starting with 9', () => {
    expect(regex.test('8812345678')).toBe(false)
  })

  it('rejects a number that is too short', () => {
    expect(regex.test('98123')).toBe(false)
  })
})

describe('NAME_PATTERN', () => {
  const regex = new RegExp(NAME_PATTERN)

  it('accepts a name with an apostrophe and hyphen', () => {
    expect(regex.test("Mary-Jane O'Brien")).toBe(true)
  })

  it('rejects digits', () => {
    expect(regex.test('John3')).toBe(false)
  })

  it('rejects a single character', () => {
    expect(regex.test('J')).toBe(false)
  })

  // The bug this guards against: a hyphen left unescaped inside a []
  // character class silently makes some browsers treat the whole pattern
  // attribute as a no-op instead of enforcing it (see this project's own
  // memory on the subject) - asserting the pattern actually rejects
  // something proves it's still a real constraint, not a disabled one.
  it('is still an enforced constraint, not a silently-disabled one', () => {
    expect(regex.test('')).toBe(false)
    expect(regex.test('   ')).toBe(false)
  })
})
