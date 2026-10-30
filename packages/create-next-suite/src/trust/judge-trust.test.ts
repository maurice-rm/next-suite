import { describe, expect, it } from 'vitest'

import { judgeTrust } from './judge-trust.ts'

const HASH = `sha256-${'a'.repeat(64)}`
const OTHER_HASH = `sha256-${'b'.repeat(64)}`
const NOTHING_TRUSTED = { patterns: [], flagPatterns: [], trustedContent: {} }
const remote = (address: string) => ({ address, contentHash: HASH, isLocal: false })

describe('judgeTrust', () => {
  it('trusts a local directory by nature and a source --trust covers, without recording', () => {
    expect(judgeTrust({ ...remote('./mail'), isLocal: true }, NOTHING_TRUSTED)).toEqual({
      kind: 'trusted',
      recordsContent: false,
    })
    expect(
      judgeTrust(remote('github:acme/mail'), {
        ...NOTHING_TRUSTED,
        flagPatterns: ['github:acme/*'],
      }),
    ).toEqual({ kind: 'trusted', recordsContent: false })
  })

  it('knows no other source unless the user configuration trusts it', () => {
    expect(judgeTrust(remote('github:evil/mail'), NOTHING_TRUSTED)).toEqual({ kind: 'unknown' })
    expect(
      judgeTrust(remote('github:evil/mail'), { ...NOTHING_TRUSTED, patterns: ['github:acme/*'] }),
    ).toEqual({ kind: 'unknown' })
  })

  it('records the first content of a trusted source and asks again once it changes', () => {
    const trusted = { ...NOTHING_TRUSTED, patterns: ['github:acme/*'] }
    const address = 'github:acme/mail'

    expect(judgeTrust(remote(address), trusted)).toEqual({ kind: 'trusted', recordsContent: true })
    expect(
      judgeTrust(remote(address), { ...trusted, trustedContent: { [address]: HASH } }),
    ).toEqual({ kind: 'trusted', recordsContent: false })
    expect(
      judgeTrust(remote(address), { ...trusted, trustedContent: { [address]: OTHER_HASH } }),
    ).toEqual({ kind: 'changed', trustedHash: OTHER_HASH })
  })
})
