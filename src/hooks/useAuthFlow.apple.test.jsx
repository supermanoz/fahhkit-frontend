import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const post = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (orig) => ({
  ...(await orig()),
  postJson: post,
}))

import { useAuthFlow } from './useAuthFlow'

beforeEach(() => post.mockReset().mockResolvedValue({ tokenId: 't' }))

describe('signInWithApple request', () => {
  it('posts the identity token, code, RAW nonce, name and email to /v1/auth/apple', async () => {
    const { result } = renderHook(() => useAuthFlow())
    await result.current.signInWithApple('idtok', 'Ada Lovelace', {
      authorizationCode: 'code',
      nonce: 'rawnonce',
      email: 'a@b.c',
    })
    expect(post).toHaveBeenCalledWith('/v1/auth/apple', {
      identityToken: 'idtok',
      fullName: 'Ada Lovelace',
      authorizationCode: 'code',
      nonce: 'rawnonce',
      email: 'a@b.c',
    })
  })
  it('later login: no name / email keys needed, login still goes through', async () => {
    const { result } = renderHook(() => useAuthFlow())
    await result.current.signInWithApple('idtok', undefined, {
      authorizationCode: 'code',
      nonce: 'n',
    })
    const body = post.mock.calls[0][1]
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      identityToken: 'idtok',
      authorizationCode: 'code',
      nonce: 'n',
    })
  })
})
