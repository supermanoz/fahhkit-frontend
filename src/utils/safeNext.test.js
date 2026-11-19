import { describe, expect, it } from 'vitest'
import { buildLoginPath, nextMessage, sanitizeNext } from './safeNext'

describe('sanitizeNext - accepts only same-site paths', () => {
  it.each([
    ['/shop', '/shop'],
    ['/shop?pack=500', '/shop?pack=500'],
    [
      '/payment-status?purchaseId=12&status=PAID',
      '/payment-status?purchaseId=12&status=PAID',
    ],
    ['/profile/edit#password', '/profile/edit#password'],
    ['/runs/42', '/runs/42'],
    ['/a/./b/../c', '/a/c'],
    ['/shop?q=a b', '/shop?q=a%20b'],
  ])('%s', (input, expected) => {
    expect(sanitizeNext(input)).toBe(expected)
  })

  it.each([
    '//evil.com',
    '//evil.com/shop',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'https://evil.com',
    'http://evil.com/shop',
    'javascript:alert(1)',
    'data:text/html,hi',
    'evil.com/shop',
    'shop',
    '',
    ' /shop',
    '/\t/evil.com',
    '/\n/evil.com',
    '/shop\r\nSet-Cookie: x=1',
    '/a\\b',
  ])('rejects %j', (input) => {
    expect(sanitizeNext(input)).toBe('/')
  })

  it('rejects non-strings and absurd lengths', () => {
    for (const v of [null, undefined, 42, {}, ['/shop']]) {
      expect(sanitizeNext(v)).toBe('/')
    }
    expect(sanitizeNext(`/${'a'.repeat(3000)}`)).toBe('/')
  })

  it('never bounces back to the auth pages', () => {
    for (const p of [
      '/login',
      '/login?next=/shop',
      '/register',
      '/forgot-password',
      '/update-password/9800000000/x',
    ]) {
      expect(sanitizeNext(p)).toBe('/')
    }
  })

  it('a percent-encoded slash trick stays a plain same-site path', () => {
    expect(sanitizeNext('/%2Fevil.com')).toBe('/%2Fevil.com')
  })

  it('uses the given fallback', () => {
    expect(sanitizeNext('//x', null)).toBeNull()
    expect(sanitizeNext('//x', '/game')).toBe('/game')
  })
})

describe('buildLoginPath', () => {
  it('encodes path + query into ?next=', () => {
    expect(buildLoginPath('/shop?pack=500')).toBe(
      '/login?next=%2Fshop%3Fpack%3D500'
    )
  })
  it('round-trips through sanitizeNext', () => {
    const q = new URLSearchParams(
      buildLoginPath('/payment-status?purchaseId=1&status=PAID').split('?')[1]
    )
    expect(sanitizeNext(q.get('next'))).toBe(
      '/payment-status?purchaseId=1&status=PAID'
    )
  })
  it('keeps a plain sign-in plain for the default page or anything unsafe', () => {
    expect(buildLoginPath('/')).toBe('/login')
    expect(buildLoginPath('//evil.com')).toBe('/login')
    expect(buildLoginPath(undefined)).toBe('/login')
  })
  it('never carries a credential of its own', () => {
    expect(buildLoginPath('/shop')).not.toMatch(/token|password|bearer/i)
  })
})

describe('nextMessage', () => {
  it('names where they were going', () => {
    expect(nextMessage('/shop?pack=500')).toBe(
      'Sign in to continue to the shop.'
    )
    expect(nextMessage('/profile/edit')).toBe('Sign in to edit your profile.')
    expect(nextMessage('/payment-status?status=PAID')).toBe(
      'Sign in to see your payment status.'
    )
    expect(nextMessage('/history')).toBe('Sign in to see your runs.')
    expect(nextMessage('/admin/dashboard')).toBe('Sign in to continue.')
  })
  it('shows nothing without a (valid) next', () => {
    expect(nextMessage(null)).toBeNull()
    expect(nextMessage('//evil.com')).toBeNull()
  })
})
