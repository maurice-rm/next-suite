import { describe, expect, it } from 'vitest'

import { isPinned, matchesTrustPattern, sourceOf } from './trust-pattern.ts'

describe('trust patterns', () => {
  it('leaves out refs and versions from the source of an address', () => {
    expect(sourceOf('github:acme/plugins/mail#v2')).toBe('github:acme/plugins/mail')
    expect(sourceOf('npm:@acme/mail@^1')).toBe('npm:@acme/mail')
    expect(sourceOf('@acme/mail')).toBe('@acme/mail')
  })

  it('matches patterns with * against the source', () => {
    expect(matchesTrustPattern('github:acme/plugins/mail#main', 'github:acme/*')).toBe(true)
    expect(matchesTrustPattern('npm:@acme/mail@1.0.0', 'npm:@acme/*')).toBe(true)
    expect(matchesTrustPattern('@acme/mail', '@acme/*')).toBe(true)
    expect(matchesTrustPattern('github:evil/plugins', 'github:acme/*')).toBe(false)
    expect(matchesTrustPattern('github:acme.evil/plugins', 'github:acme/*')).toBe(false)
  })

  it('knows which addresses name a fixed version', () => {
    expect(isPinned('npm:mail@1.2.3')).toBe(true)
    expect(isPinned('npm:mail@^1')).toBe(false)
    expect(isPinned('github:acme/mail#v1')).toBe(true)
    expect(isPinned('github:acme/mail')).toBe(false)
    expect(isPinned('@acme/mail')).toBe(false)
  })
})
