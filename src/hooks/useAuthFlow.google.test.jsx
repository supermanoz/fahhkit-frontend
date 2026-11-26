// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
const g = vi.hoisted(() => ({ googleSignOut: vi.fn(async () => {}) }))
const push = vi.hoisted(() => ({ unregisterPushToken: vi.fn(async () => {}) }))
vi.mock('../api/client', async (orig) => ({
  ...(await orig()),
  postJson: post,
  getJson: get,
}))
vi.mock('../utils/googleSession', () => g)
vi.mock('../utils/push', () => push)

import { useAuthFlow } from './useAuthFlow'
import { getToken, getUser } from '../api/client'
import { bindUser, getCoins, setCoins } from '../state/coins'

beforeEach(() => {
  localStorage.clear()
  post.mockReset()
  get.mockReset()
  g.googleSignOut.mockClear()
  push.unregisterPushToken.mockClear()
})

describe('Google sign-in against the backend', () => {
  it('posts ONLY the idToken to /v1/auth/google', async () => {
    post.mockResolvedValue({ tokenId: 't' })
    const { result } = renderHook(() => useAuthFlow())
    await result.current.signInWithGoogle('google-id-token')
    expect(post).toHaveBeenCalledWith('/v1/auth/google', {
      idToken: 'google-id-token',
    })
  })

  it('stores the tokenId, loads and caches the user (first login or not)', async () => {
    get.mockResolvedValue({ id: 'u1', email: 'a@b.c', nickname: null })
    const { result } = renderHook(() => useAuthFlow())
    const user = await result.current.finishSignIn({
      tokenId: 'jwt-1',
      firstLogin: true,
      userType: 'ATHLETE',
    })
    expect(getToken()).toBe('jwt-1')
    expect(getUser()).toMatchObject({ id: 'u1' })
    // A first-login athlete signs straight in; the empty nickname is what
    // makes the Me tab offer the nickname card.
    expect(user.nickname).toBeNull()
  })

  it("a new sign-in never inherits the previous account's local state", async () => {
    localStorage.setItem('fahhkit_territory_avatar_id', 'old-hero')
    localStorage.setItem('fahhkit_indoor_run_v1', '{"status":"running"}')
    get.mockResolvedValue({ id: 'u2' })
    const { result } = renderHook(() => useAuthFlow())
    await result.current.finishSignIn({ tokenId: 'jwt-2' })
    expect(localStorage.getItem('fahhkit_territory_avatar_id')).toBeNull()
    expect(localStorage.getItem('fahhkit_indoor_run_v1')).toBeNull()
  })

  it('logout: signs the Google account out, clears the session, the indoor draft and the coin balance', async () => {
    localStorage.setItem('fahhkit_token', 'jwt')
    localStorage.setItem('fahhkit_user', '{"id":"u1"}')
    localStorage.setItem('fahhkit_indoor_run_v1', '{"status":"running"}')
    localStorage.setItem('fahhkit_indoor_run_ids_v1', '["r1"]')
    bindUser('u1')
    setCoins(120, 'test')
    expect(getCoins()).toBe(120)

    const { result } = renderHook(() => useAuthFlow())
    await result.current.signOut()

    expect(push.unregisterPushToken).toHaveBeenCalled()
    expect(g.googleSignOut).toHaveBeenCalled()
    expect(getToken()).toBeNull()
    expect(getUser()).toBeNull()
    expect(localStorage.getItem('fahhkit_indoor_run_v1')).toBeNull()
    expect(localStorage.getItem('fahhkit_indoor_run_ids_v1')).toBeNull()
    // The coin store follows the signed-in user (useCoinsSession): no user
    // -> balance reset, nothing carried to the next account.
    bindUser(null)
    expect(getCoins()).toBeNull()
  })
})
