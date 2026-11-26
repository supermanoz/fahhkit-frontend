import { describe, it, expect } from 'vitest'
import {
  getDisplayName,
  displayName,
  getRoleDisplayName,
  initials,
  playerName,
  DEFAULT_NAME,
} from './playerName'

describe('getDisplayName / displayName', () => {
  it('prefers the nickname over the real name', () => {
    expect(displayName({ nickname: 'Comet', fullName: 'Manoj Basnet' })).toBe(
      'Comet'
    )
  })
  it('trims the nickname', () => {
    expect(displayName({ nickname: '  Comet  ', fullName: 'A B' })).toBe(
      'Comet'
    )
  })
  it('an empty or whitespace-only nickname counts as none', () => {
    expect(displayName({ nickname: '', fullName: 'Manoj Basnet' })).toBe(
      'Manoj'
    )
    expect(displayName({ nickname: '   ', fullName: 'Manoj Basnet' })).toBe(
      'Manoj'
    )
    expect(displayName({ nickname: null, fullName: 'Sita Rai' })).toBe('Sita')
  })
  it('falls back to "Runner" when there is no name at all', () => {
    expect(displayName({})).toBe(DEFAULT_NAME)
    expect(displayName(null)).toBe('Runner')
    expect(displayName(undefined)).toBe('Runner')
    expect(displayName({ nickname: ' ', fullName: ' ' })).toBe('Runner')
  })
  it('keeps the caller fallback when one is passed', () => {
    expect(getDisplayName({}, 'a rival')).toBe('a rival')
    expect(getDisplayName(null)).toBe('')
  })
  it('accepts every field shape the API uses', () => {
    expect(displayName({ nickName: 'Zed' })).toBe('Zed')
    expect(displayName({ displayName: 'Zed' })).toBe('Zed')
    expect(displayName({ name: 'Rita Gurung' })).toBe('Rita')
    expect(displayName({ username: 'rita_g' })).toBe('rita_g')
    expect(displayName({ userName: 'rita_g' })).toBe('rita_g')
    expect(displayName({ firstName: 'Rita', lastName: 'Gurung' })).toBe('Rita')
  })
  it('reads nested user / player / owner objects', () => {
    expect(displayName({ user: { nickname: 'Nova' } })).toBe('Nova')
    expect(displayName({ player: { fullName: 'Ana Maya' } })).toBe('Ana')
    expect(displayName({ owner: { nickname: ' ', name: 'Bo Li' } })).toBe('Bo')
  })
  it('treats a plain string as the real name', () => {
    expect(displayName('Manoj Basnet')).toBe('Manoj')
    expect(displayName('   ')).toBe('Runner')
  })
})

describe('getRoleDisplayName', () => {
  it('reads <role>Nickname before <role>Name', () => {
    const c = { ownerNickname: 'Blaze', ownerName: 'Hari Thapa' }
    expect(getRoleDisplayName(c, 'owner')).toBe('Blaze')
    expect(getRoleDisplayName({ ownerName: 'Hari Thapa' }, 'owner')).toBe(
      'Hari'
    )
    expect(getRoleDisplayName({}, 'owner', 'a rival')).toBe('a rival')
  })
})

describe('initials', () => {
  it('is built from the display name', () => {
    expect(initials({ nickname: 'Comet', fullName: 'Manoj Basnet' })).toBe('C')
    expect(initials({ fullName: 'Manoj Basnet' })).toBe('M')
    expect(initials({ nickname: 'Fast Fox' })).toBe('FF')
    expect(initials({ nickname: 'a b c' })).toBe('AC')
  })
  it('is "?" when there is nothing', () => {
    expect(initials(null)).toBe('?')
    expect(initials({ nickname: ' ' })).toBe('?')
  })
})

describe('playerName', () => {
  it('nickname else first word', () => {
    expect(playerName('Zed', 'A B')).toBe('Zed')
    expect(playerName('', 'A B')).toBe('A')
  })
})
