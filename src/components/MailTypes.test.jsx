import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../game/ui/Toast', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('../api/client', () => ({
  resolveFileUrl: (u) => u,
  toClubRoleWords: (t) => t,
}))

import MailPanel from './MailPanel'
import MailDetail from './MailDetail'
import { MAIL_TYPE_INFO } from '../utils/mailTypes'

afterEach(cleanup)

const now = new Date().toISOString()
const noop = () => {}
const mailbox = (mail) => ({
  mail,
  loaded: true,
  error: null,
  busyId: null,
  actionError: null,
  open: noop,
  claim: noop,
  decline: noop,
  remove: noop,
  removeAllRead: noop,
  openBroadcast: noop,
  refresh: noop,
  mailPage: 1,
  mailTotalPages: 1,
  loadingMail: false,
  goToMailPage: noop,
  broadcasts: [],
  broadcastHasMore: false,
  loadingMoreBroadcasts: false,
  loadMoreBroadcasts: noop,
})

const known = Object.keys(MAIL_TYPE_INFO).map((type, i) => ({
  id: `k${i}`,
  type,
  status: 'UNREAD',
  title: `Title ${type}`,
  body: `Body ${type}`,
  createdDate: now,
}))
const odd = [
  {
    id: 'u1',
    type: 'BRAND_NEW_TYPE',
    status: 'UNREAD',
    title: 'Future mail',
    body: 'x',
    createdDate: now,
  },
  {
    id: 'u2',
    type: null,
    status: 'READ',
    title: null,
    body: null,
    createdDate: now,
  },
  {
    id: 'u3',
    type: 'NOTICE',
    status: 'UNREAD',
    title: 'No date',
    body: 'b',
    createdDate: null,
  },
  {
    id: 'u4',
    type: 'RUN_RESULT',
    status: 'WEIRD_STATUS',
    title: 'Odd status',
    body: 'b',
    createdDate: 'not-a-date',
  },
]

describe('Mail list', () => {
  it('renders every known type, unknown types, nulls and bad dates - nothing is dropped', () => {
    const all = [...known, ...odd]
    const { container } = render(<MailPanel mailbox={mailbox(all)} />)
    expect(container.querySelectorAll('.mail-item')).toHaveLength(all.length)
    for (const m of known)
      expect(screen.getByText(`Title ${m.type}`)).toBeTruthy()
    expect(screen.getByText('Future mail')).toBeTruthy()
    expect(screen.getByText('No date')).toBeTruthy()
    expect(screen.getByText('Odd status')).toBeTruthy()
    // the mail with no title still gets a visible one
    expect(screen.getAllByText('Message').length).toBeGreaterThan(0)
  })
})

describe('Mail detail', () => {
  const detail = (item) =>
    render(
      <MailDetail
        item={item}
        kind="mail"
        onClose={noop}
        onClaim={noop}
        onDecline={noop}
        onDelete={noop}
      />
    )

  it('unknown / informational types are read-only: no Claim button', () => {
    for (const type of [
      'BRAND_NEW_TYPE',
      null,
      'RUN_RESULT',
      'PVP_RESULT',
      'LEVEL_UP',
      'PROGRESS',
      'NOTICE',
    ]) {
      const { unmount } = detail({
        id: 'x',
        type,
        status: 'UNREAD',
        title: 't',
        body: 'b',
        createdDate: now,
      })
      expect(screen.queryByText(/claim/i), String(type)).toBeNull()
      expect(screen.queryByText(/join club/i), String(type)).toBeNull()
      unmount()
    }
  })

  it('gift and club invite keep their actions', () => {
    detail({
      id: 'g',
      type: 'STORE_ITEM_GRANT',
      status: 'UNREAD',
      title: 't',
      body: 'b',
      createdDate: now,
      attachment: { attachmentType: 'STORE_ITEM', refId: '9', claimed: false },
    })
    expect(screen.getByText(/claim/i)).toBeTruthy()
    cleanup()
    detail({
      id: 'c',
      type: 'CLUB_INVITE',
      status: 'UNREAD',
      title: 't',
      body: 'b',
      createdDate: now,
      attachment: { attachmentType: 'CLUB', refId: '3', claimed: false },
    })
    expect(screen.getByText(/join/i)).toBeTruthy()
    expect(screen.getByText(/decline/i)).toBeTruthy()
  })

  it('a missing title/body still renders a labelled message', () => {
    detail({
      id: 'n',
      type: 'BRAND_NEW_TYPE',
      status: 'READ',
      title: null,
      body: null,
      createdDate: now,
    })
    expect(screen.getAllByText('Message').length).toBeGreaterThan(0)
  })
})

describe('MailDetail event facts', () => {
  const render1 = (item) =>
    render(
      <MailDetail
        item={item}
        onClose={() => {}}
        onClaim={() => {}}
        onDecline={() => {}}
        onDelete={() => {}}
      />
    )
  it('shows facts for an event mail, hides null ones', () => {
    render1({
      id: 'x',
      type: 'RUN_RESULT',
      status: 'READ',
      title: 'Run complete',
      body: 'Nice',
      createdDate: now,
      data: {
        mode: 'CONQUER',
        status: 'ACCEPTED',
        distanceMeters: 2000,
        coinsEarned: null,
      },
    })
    expect(screen.getByTestId('mail-facts')).toHaveTextContent('2.00 km')
    expect(screen.getByTestId('mail-facts')).not.toHaveTextContent(
      /Coins earned|null/
    )
  })
  it('unknown type renders a plain message without facts', () => {
    render1({
      id: 'y',
      type: 'FUTURE',
      status: 'READ',
      title: '',
      body: 'hi',
      createdDate: now,
      data: { a: 1 },
    })
    expect(screen.queryByTestId('mail-facts')).toBeNull()
    expect(screen.getByText('hi')).toBeInTheDocument()
  })
})

describe('Claim only when there is something to claim', () => {
  const show = (item) =>
    render(
      <MailDetail
        item={item}
        kind="mail"
        onClose={noop}
        onClaim={noop}
        onDecline={noop}
        onDelete={noop}
      />
    )
  const base = {
    id: 'x',
    status: 'UNREAD',
    title: 't',
    body: 'b',
    createdDate: now,
  }
  const INFO = [
    'RUN_RESULT',
    'PVP_RESULT',
    'CLUB_WAR_RESULT',
    'TERRITORY_CAPTURED',
    'TERRITORY_LOST',
    'LEVEL_UP',
    'NOTICE',
    'PROGRESS',
  ]
  it.each(INFO)('%s: no Claim button, only Delete', (type) => {
    show({ ...base, type })
    expect(screen.queryByRole('button', { name: /claim|join/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete mail' })).toBeTruthy()
  })
  it('REWARD without an attachment (coins already paid): no Claim', () => {
    show({ ...base, type: 'REWARD', data: { coins: 20 } })
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull()
  })
  it('REWARD with an unclaimed attachment: Claim; once claimed: none', () => {
    show({
      ...base,
      type: 'REWARD',
      attachment: { attachmentType: 'COINS', refId: '1', claimed: false },
    })
    expect(screen.getByRole('button', { name: /claim/i })).toBeTruthy()
    cleanup()
    show({
      ...base,
      type: 'REWARD',
      status: 'CLAIMED',
      attachment: { attachmentType: 'COINS', refId: '1', claimed: true },
    })
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull()
  })
  it('a gift with no attachment shows no Claim (never the "nothing to claim" path)', () => {
    show({ ...base, type: 'STORE_ITEM_GRANT' })
    expect(screen.queryByRole('button', { name: /claim/i })).toBeNull()
  })
})

describe('Mail list readability + long titles', () => {
  it('long titles are not cut to one line and rows sit in the readable container', () => {
    const long = 'A really long mail title that must wrap instead of clipping'
    const { container } = render(
      <MailPanel
        mailbox={mailbox([
          {
            id: 'l',
            type: 'RUN_RESULT',
            status: 'UNREAD',
            title: long,
            body: 'b',
            createdDate: now,
          },
        ])}
        onClaimed={noop}
        resolveStoreItem={noop}
      />
    )
    expect(screen.getByText(long)).toBeTruthy()
    expect(
      container.querySelector('.g-readable .mail-item-title')
    ).not.toBeNull()
  })
  it('Mark all read is disabled (muted) when nothing is unread', () => {
    render(
      <MailPanel
        mailbox={mailbox([
          {
            id: 'r',
            type: 'NOTICE',
            status: 'READ',
            title: 'Read one',
            body: 'b',
            createdDate: now,
          },
        ])}
        onClaimed={noop}
        resolveStoreItem={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeDisabled()
  })
})
