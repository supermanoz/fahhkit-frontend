import { describe, expect, it } from 'vitest'
import {
  isAllowedHost,
  isSafeExternalUrl,
  isSafePaymentUrl,
  numericId,
  safeHref,
} from './safeUrl'

describe('safeUrl', () => {
  it('allows plain http(s) links', () => {
    expect(isSafeExternalUrl('https://www.instagram.com/x')).toBe(true)
    expect(safeHref('http://example.com/a')).toBe('http://example.com/a')
  })
  it('rejects dangerous schemes and junk', () => {
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<script>',
      'file:///etc/passwd',
      'intent://x#Intent;end',
      '//evil.com',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(isSafeExternalUrl(bad)).toBe(false)
      expect(safeHref(bad)).toBeUndefined()
    }
  })
  it('rejects embedded credentials', () => {
    expect(isSafeExternalUrl('https://fahhkit.netlify.app@evil.com/')).toBe(
      false
    )
  })
  it('payment urls must be https', () => {
    expect(isSafePaymentUrl('https://pay.khalti.com/?pidx=1')).toBe(true)
    expect(isSafePaymentUrl('http://pay.khalti.com/')).toBe(false)
  })
  it('host allowlist matches exact host and subdomains only', () => {
    const hosts = ['fahhkit.netlify.app', 'cafebizarre.com.np']
    expect(isAllowedHost('https://fahhkit.netlify.app/shop', hosts)).toBe(true)
    expect(isAllowedHost('https://api.cafebizarre.com.np/x', hosts)).toBe(true)
    expect(isAllowedHost('https://evilcafebizarre.com.np/', hosts)).toBe(false)
    expect(isAllowedHost('https://fahhkit.netlify.app.evil.com/', hosts)).toBe(
      false
    )
  })
  it('numericId only passes digits', () => {
    expect(numericId('123')).toBe('123')
    expect(numericId('1/../admin')).toBeNull()
    expect(numericId(null)).toBeNull()
  })
})
