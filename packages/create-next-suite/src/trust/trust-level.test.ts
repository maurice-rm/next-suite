import { describe, expect, it } from 'vitest'

import { isPinned, matchesPattern, sourcePattern, trustLevelOf } from './trust-level.ts'

const external = (address: string) => ({ kind: 'external' as const, address, resolved: undefined })

describe('trust levels', () => {
  it('leaves out refs and versions from the source of an address', () => {
    expect(sourcePattern('github:acme/plugins/mail#v2')).toBe('github:acme/plugins/mail')
    expect(sourcePattern('npm:@acme/mail@^1')).toBe('npm:@acme/mail')
  })

  it('matches patterns with * against the source', () => {
    expect(matchesPattern('github:acme/plugins/mail#main', 'github:acme/*')).toBe(true)
    expect(matchesPattern('npm:@acme/mail@1.0.0', 'npm:@acme/*')).toBe(true)
    expect(matchesPattern('github:evil/plugins', 'github:acme/*')).toBe(false)
  })

  it('trusts built-in plugins, local folders and sources on the trust list', () => {
    expect(trustLevelOf({ kind: 'builtin' }, [])).toBe('builtin')
    expect(trustLevelOf(external('./mail'), [])).toBe('trusted')
    expect(trustLevelOf(external('github:acme/mail'), ['github:acme/*'])).toBe('trusted')
    expect(trustLevelOf(external('github:evil/mail'), ['github:acme/*'])).toBe('unknown')
  })

  it('knows which addresses name a fixed version', () => {
    expect(isPinned('npm:mail@1.2.3')).toBe(true)
    expect(isPinned('npm:mail@^1')).toBe(false)
    expect(isPinned('github:acme/mail#v1')).toBe(true)
    expect(isPinned('github:acme/mail')).toBe(false)
  })
})
