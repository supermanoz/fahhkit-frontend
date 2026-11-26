import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberNickname,
  lookupNickname,
  harvestNicknames,
  clearNicknameDirectory,
} from './nicknameDirectory'
import { getDisplayName, getRoleDisplayName } from './playerName'

beforeEach(() => clearNicknameDirectory())

describe('harvestNicknames', () => {
  it('learns plain person objects and role pairs, at any depth', () => {
    harvestNicknames({
      content: [
        { userId: 'u1', fullName: 'Ana Maya', nickname: ' Comet ' },
        { id: 'u2', fullName: 'Bo Li', nickname: 'Nova' },
      ],
      challenge: { ownerId: 'u3', ownerNickname: 'Blaze', ownerName: 'X Y' },
    })
    expect(lookupNickname('u1')).toBe('Comet')
    expect(lookupNickname('u2')).toBe('Nova')
    expect(lookupNickname('u3')).toBe('Blaze')
  })
  it('ignores a nickname with no id, and an id with no nickname', () => {
    harvestNicknames({ nickname: 'Lonely' })
    harvestNicknames({ userId: 'u9', fullName: 'No Nick' })
    expect(lookupNickname('u9')).toBe('')
  })
  it('a cleared nickname removes the old one', () => {
    rememberNickname('u1', 'Comet')
    harvestNicknames({ userId: 'u1', nickname: '  ' })
    expect(lookupNickname('u1')).toBe('')
  })
  it('never throws on odd input', () => {
    expect(() => harvestNicknames(null)).not.toThrow()
    expect(() => harvestNicknames('x')).not.toThrow()
    expect(() => harvestNicknames([[[1]], { a: undefined }])).not.toThrow()
  })
  it('stays bounded', () => {
    for (let i = 0; i < 1000; i++) rememberNickname(`u${i}`, `n${i}`)
    expect(lookupNickname('u0')).toBe('')
    expect(lookupNickname('u999')).toBe('n999')
  })
})

describe('the helper uses what the directory learned', () => {
  it('a row with only a real name shows the nickname seen elsewhere', () => {
    harvestNicknames({ userId: 'u1', fullName: 'Ana Maya', nickname: 'Comet' })
    // leaderboard-style row: id + real name only
    expect(getDisplayName({ userId: 'u1', fullName: 'Ana Maya' })).toBe('Comet')
    // role pair from a challenge
    expect(
      getRoleDisplayName(
        { opponentId: 'u1', opponentName: 'Ana Maya' },
        'opponent'
      )
    ).toBe('Comet')
  })
  it("the row's own nickname wins over the directory", () => {
    rememberNickname('u1', 'Old')
    expect(
      getDisplayName({ userId: 'u1', fullName: 'A B', nickname: 'New' })
    ).toBe('New')
  })
  it('falls back to the real name for a player nobody has a nickname for', () => {
    expect(getDisplayName({ userId: 'u7', fullName: 'Sita Rai' })).toBe('Sita')
  })
})
