import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { DEFAULT_NAME, getDisplayName, playerNameOf } from './playerName'
import DisplayName from '../components/DisplayName'
import { mySide, partyOf } from '../hooks/usePvp'
import { resolveRivalHero } from '../components/pvp/PvpParts'

describe('getDisplayName', () => {
  it('nickname wins', () => {
    expect(
      getDisplayName({ nickname: 'Flash', fullName: 'Aarav Sharma' })
    ).toBe('Flash')
  })
  it.each([null, undefined, '', '   ', '\t\n'])(
    'blank nickname %p counts as none -> name',
    (nickname) => {
      expect(getDisplayName({ nickname, fullName: 'Aarav Sharma' })).toBe(
        'Aarav'
      )
    }
  )
  it('accepts `name`, a plain string, and junk', () => {
    expect(getDisplayName({ name: 'Sita Rai' })).toBe('Sita')
    expect(getDisplayName('Sita Rai')).toBe('Sita')
    expect(getDisplayName(null)).toBe('')
    expect(getDisplayName({ nickname: 42, fullName: 7 })).toBe('')
  })
  it('keeps a long nickname whole (CSS ellipsises it) and trims it', () => {
    const long = 'N'.repeat(60)
    expect(getDisplayName({ nickname: `  ${long} ` })).toBe(long)
  })
  it('playerNameOf is the same function', () => {
    expect(playerNameOf).toBe(getDisplayName)
  })
})

describe('PvP sides', () => {
  const c = {
    challengerId: 'me',
    challengerName: 'Me Myself',
    challengerNickname: 'Mimi',
    opponentId: 'r1',
    opponentName: 'Aarav Sharma',
    opponentNickname: '  ',
    opponentHeroName: 'Blaze',
    opponentHeroId: 'h1',
    opponentHeroColor: 'red',
  }
  it('rival shown by nickname, else first name; hero carried through', () => {
    const side = mySide(c, 'me')
    expect(side.opponentName).toBe('Aarav')
    expect(side.opponentHero).toEqual({ name: 'Blaze', id: 'h1', color: 'red' })
    const other = mySide(c, 'r1')
    expect(other.opponentName).toBe('Mimi')
    expect(other.opponentHero).toBeNull()
  })
  it("no hero fields (today's server) -> null, never crashes", () => {
    expect(partyOf({ opponentName: 'A B' }, 'opponent').hero).toBeNull()
    expect(mySide({ challengerId: 'x' }, 'y').opponentName).toBe('')
  })
})

describe('resolveRivalHero', () => {
  it('bundled hero -> sprite (static frame)', () => {
    expect(resolveRivalHero({ name: 'blaze' })).toEqual({
      kind: 'sprite',
      name: 'blaze',
    })
  })
  it('catalogue hero by id then name -> portrait image', () => {
    const catalog = [
      { id: 'h9', name: 'Zorro', portraitUrl: 'https://x/n.png' },
    ]
    expect(resolveRivalHero({ id: 'h9' }, catalog)).toMatchObject({
      kind: 'image',
      name: 'Zorro',
    })
    expect(resolveRivalHero({ name: ' zorro ' }, catalog)).toMatchObject({
      kind: 'image',
    })
  })
  it('unknown / missing hero -> null so the caller falls back', () => {
    expect(resolveRivalHero({ name: 'Zzz Unknown' }, [])).toBeNull()
    expect(resolveRivalHero({ id: 'nope' }, [])).toBeNull()
    expect(resolveRivalHero(null)).toBeNull()
    expect(resolveRivalHero({})).toBeNull()
  })
})

describe('getDisplayName - shapes and fallbacks', () => {
  it('reads nickName, username, userName and firstName/lastName', () => {
    expect(getDisplayName({ nickName: ' Flash ' })).toBe('Flash')
    expect(getDisplayName({ username: 'rita99' })).toBe('rita99')
    expect(getDisplayName({ userName: 'rita99' })).toBe('rita99')
    expect(getDisplayName({ firstName: 'Rita', lastName: 'Gurung' })).toBe(
      'Rita'
    )
  })
  it('nickname beats every real-name field', () => {
    expect(
      getDisplayName({
        nickname: 'Flash',
        fullName: 'A B',
        name: 'C',
        username: 'd',
      })
    ).toBe('Flash')
  })
  it('null / undefined / junk -> the given fallback, "" by default', () => {
    expect(getDisplayName(null)).toBe('')
    expect(getDisplayName(undefined, 'a rival')).toBe('a rival')
    expect(getDisplayName({ nickname: '   ' }, DEFAULT_NAME)).toBe('Runner')
    expect(getDisplayName(42)).toBe('')
  })
  it('other users: leaderboard / club member / parcel owner shapes', () => {
    // leaderboard row today: fullName only
    expect(getDisplayName({ userId: 'u1', fullName: 'Sita Rai' })).toBe('Sita')
    // once the backend adds nickname to it
    expect(
      getDisplayName({ userId: 'u1', fullName: 'Sita Rai', nickname: 'Situ' })
    ).toBe('Situ')
    // club member (ClubMembershipResponse already has both)
    expect(getDisplayName({ fullName: 'Hari Thapa', nickname: '' })).toBe(
      'Hari'
    )
    // parcel owner, with and without the future ownerNickname
    expect(
      getDisplayName({ nickname: undefined, fullName: 'Aarav Sharma' })
    ).toBe('Aarav')
    expect(getDisplayName({ nickname: 'Rav', fullName: 'Aarav Sharma' })).toBe(
      'Rav'
    )
  })
})

describe('<DisplayName>', () => {
  it('renders nickname, falls back to name, then "Runner"', () => {
    const { container, rerender } = render(
      <DisplayName user={{ nickname: 'Flash', fullName: 'Aarav Sharma' }} />
    )
    expect(container.textContent).toBe('Flash')
    rerender(
      <DisplayName user={{ nickname: '  ', fullName: 'Aarav Sharma' }} />
    )
    expect(container.textContent).toBe('Aarav')
    rerender(<DisplayName user={null} />)
    expect(container.textContent).toBe('Runner')
    rerender(<DisplayName user={undefined} fallback="a rival" />)
    expect(container.textContent).toBe('a rival')
  })
})
