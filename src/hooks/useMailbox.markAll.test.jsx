// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('../api/mail', () => ({
  claimMail: vi.fn(),
  declineMail: vi.fn(),
  deleteAllReadMail: vi.fn(),
  deleteMail: vi.fn(),
  findBroadcastMail: vi.fn().mockResolvedValue({ content: [], totalPages: 1 }),
  findMyMail: vi.fn(),
  readBroadcastMail: vi.fn(),
  readMail: vi.fn(),
}))
import { findMyMail, readMail, claimMail } from '../api/mail'
import { useMailbox } from './useMailbox'

const m = (id, status = 'UNREAD', extra = {}) => ({
  id,
  type: 'RUN_RESULT',
  status,
  title: id,
  body: '',
  createdDate: new Date().toISOString(),
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('mark all read', () => {
  it('updates the unread count at once, then reads every unread mail (also on other pages)', async () => {
    findMyMail.mockImplementation(async (page) =>
      page === 1
        ? { content: [m('a'), m('b'), m('c', 'READ')], totalPages: 2 }
        : { content: [m('d')], totalPages: 2 }
    )
    readMail.mockResolvedValue({})
    const { result } = renderHook(() => useMailbox())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.unreadCount).toBe(2)
    let count
    await act(async () => {
      const p = result.current.markAllRead()
      count = await p
    })
    expect(result.current.unreadCount).toBe(0) // badge cleared
    expect(count).toBe(3)
    expect(readMail.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b', 'd'])
  })

  it('a failed read puts that mail back as unread', async () => {
    findMyMail.mockResolvedValue({ content: [m('a'), m('b')], totalPages: 1 })
    readMail.mockImplementation(async (id) => {
      if (id === 'b') throw new Error('x')
      return {}
    })
    const { result } = renderHook(() => useMailbox())
    await act(async () => {
      await result.current.refresh()
    })
    await act(async () => {
      await result.current.markAllRead()
    })
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
  })
})

describe('claim guard', () => {
  it('never calls the server for a mail with nothing to claim', async () => {
    findMyMail.mockResolvedValue({ content: [m('t', 'READ')], totalPages: 1 })
    const { result } = renderHook(() => useMailbox())
    await act(async () => {
      await result.current.refresh()
    })
    let r
    await act(async () => {
      r = await result.current.claim(result.current.mail[0])
    })
    expect(r).toBeNull()
    expect(claimMail).not.toHaveBeenCalled()
  })
})
