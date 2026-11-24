// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import IdleNudge from './IdleNudge'

afterEach(cleanup)

describe('IdleNudge with PvP hidden', () => {
  it('never offers a battle line or button', () => {
    for (let i = 0; i < 40; i++) {
      const { container, unmount } = render(
        <IdleNudge
          onRun={() => {}}
          onBattle={vi.fn()}
          onDismiss={() => {}}
          showBattle={false}
        />
      )
      expect(container.textContent).not.toMatch(/battle|rival|race a real/i)
      unmount()
    }
  })
})
