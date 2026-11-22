import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

// A live message that arrives while the player is scrolled down the list must
// not move what they are reading: the sheet's scrollTop grows by exactly the
// height that was added above. jsdom has no layout, so the sheet's
// scrollHeight is driven by hand.
vi.mock('../game/ui/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../api/client', () => ({
  resolveFileUrl: (u) => u,
  toClubRoleWords: (t) => t,
}))

import MailPanel from './MailPanel'

const base = {
  loaded: true,
  error: null,
  busyId: null,
  actionError: null,
  open: vi.fn(),
  claim: vi.fn(),
  decline: vi.fn(),
  remove: vi.fn(),
  removeAllRead: vi.fn(),
  openBroadcast: vi.fn(),
  refresh: vi.fn(),
  mailPage: 1,
  mailTotalPages: 1,
  loadingMail: false,
  goToMailPage: vi.fn(),
  broadcasts: [],
  broadcastHasMore: false,
  loadingMoreBroadcasts: false,
  loadMoreBroadcasts: vi.fn(),
}
const item = (id) => ({
  id,
  type: 'NOTICE',
  status: 'READ',
  title: `Mail ${id}`,
  body: 'Body',
  createdDate: new Date().toISOString(),
})

function setup(initialIds, scrollTop, scrollHeight) {
  const sheet = document.createElement('div')
  sheet.className = 'game-menu-sheet'
  let height = scrollHeight
  Object.defineProperty(sheet, 'scrollHeight', { get: () => height })
  sheet.scrollTop = scrollTop
  document.body.appendChild(sheet)
  const view = render(
    <MailPanel mailbox={{ ...base, mail: initialIds.map(item) }} />,
    { container: sheet.appendChild(document.createElement('div')) }
  )
  const update = (ids, newHeight) => {
    height = newHeight
    view.rerender(<MailPanel mailbox={{ ...base, mail: ids.map(item) }} />)
  }
  return { sheet, update }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('a live message does not jump the scroll position', () => {
  it('scrolled down: the position moves by the height that was added above', () => {
    const { sheet, update } = setup(['b', 'c'], 300, 1000)
    update(['a', 'b', 'c'], 1100) // a new message on top, 100px tall
    expect(sheet.scrollTop).toBe(400)
  })

  it('at the very top: nothing is moved, the new message is simply seen', () => {
    const { sheet, update } = setup(['b', 'c'], 0, 1000)
    update(['a', 'b', 'c'], 1100)
    expect(sheet.scrollTop).toBe(0)
  })

  it('a different page of mail (nothing carried over) is not treated as new', () => {
    const { sheet, update } = setup(['b', 'c'], 300, 1000)
    update(['x', 'y', 'z'], 1500)
    expect(sheet.scrollTop).toBe(300)
  })

  it('several new messages at once move it by the total added', () => {
    const { sheet, update } = setup(['c'], 500, 1000)
    update(['a', 'b', 'c'], 1210)
    expect(sheet.scrollTop).toBe(710)
  })
})
