import { describe, expect, it } from 'vitest'
import {
  MAIL_TYPE_INFO,
  mailTitle,
  mailTypeClass,
  mailTypeInfo,
} from './mailTypes'

describe('mailTypeInfo', () => {
  it('knows every backend type and only these types can ever be claimable', () => {
    for (const t of Object.keys(MAIL_TYPE_INFO)) {
      expect(mailTypeInfo(t).label).toBeTruthy()
    }
    const claimable = Object.keys(MAIL_TYPE_INFO).filter(
      (t) => mailTypeInfo(t).claimable
    )
    expect(claimable.sort()).toEqual([
      'CLUB_INVITE',
      'REWARD',
      'STORE_ITEM_GRANT',
    ])
  })

  it.each([undefined, null, '', 'SOMETHING_NEW', 'constructor', '__proto__'])(
    'unknown type %p -> safe read-only fallback',
    (t) => {
      const info = mailTypeInfo(t)
      expect(info.label).toBe('Message')
      expect(info.claimable).toBe(false)
    }
  )
})

describe('mailTitle / mailTypeClass', () => {
  it('never returns blank', () => {
    expect(mailTitle({ type: 'RUN_RESULT', title: '  ' })).toBe('Run result')
    expect(mailTitle({ type: 'WAT', title: null })).toBe('Message')
    expect(mailTitle({ type: 'NOTICE', title: 'Hi' })).toBe('Hi')
    expect(mailTitle(null)).toBe('Message')
  })
  it('class suffix is css-safe', () => {
    expect(mailTypeClass('A B"<x>')).toBe('ABx')
    expect(mailTypeClass(null)).toBe('unknown')
  })
})
