// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasAskedForSteps,
  markAskedForSteps,
  shouldShowStepsPrePrompt,
  stepsNeedSettings,
} from './stepsPermission'

beforeEach(() => localStorage.clear())

describe('step-counter permission prompt', () => {
  const prompt = { available: true, permission: 'prompt' }
  it('shows our explanation once, when the OS would still ask', () => {
    expect(shouldShowStepsPrePrompt(prompt)).toBe(true)
    markAskedForSteps()
    expect(hasAskedForSteps()).toBe(true)
    expect(shouldShowStepsPrePrompt(prompt)).toBe(false)
  })
  it('never for granted / denied / unavailable (web has no pedometer)', () => {
    for (const permission of ['granted', 'denied', 'restricted', 'unavailable'])
      expect(shouldShowStepsPrePrompt({ available: true, permission })).toBe(
        false
      )
    expect(
      shouldShowStepsPrePrompt({ available: false, permission: 'prompt' })
    ).toBe(false)
  })
  it('denied / restricted offers the Settings link, nothing else does', () => {
    expect(stepsNeedSettings({ available: true, permission: 'denied' })).toBe(
      true
    )
    expect(
      stepsNeedSettings({ available: true, permission: 'restricted' })
    ).toBe(true)
    expect(stepsNeedSettings({ available: true, permission: 'granted' })).toBe(
      false
    )
    expect(stepsNeedSettings({ available: false, permission: 'denied' })).toBe(
      false
    )
  })
})
