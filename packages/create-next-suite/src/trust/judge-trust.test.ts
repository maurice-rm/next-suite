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

  it('records the first content of a trusted source and asks again for any other content', () => {
    const trusted = { ...NOTHING_TRUSTED, patterns: ['github:acme/*'] }
    const source = 'github:acme/mail'

    expect(judgeTrust(remote(source), trusted)).toEqual({ kind: 'trusted', recordsContent: true })
    expect(
      judgeTrust(remote(source), { ...trusted, trustedContent: { [source]: [OTHER_HASH, HASH] } }),
    ).toEqual({ kind: 'trusted', recordsContent: false })
    expect(
      judgeTrust(remote(source), { ...trusted, trustedContent: { [source]: [OTHER_HASH] } }),
    ).toEqual({ kind: 'changed', trustedHash: OTHER_HASH })
  })

  it('keeps the trusted content by source, so another ref or version is asked about too', () => {
    const trusted = {
      ...NOTHING_TRUSTED,
      patterns: ['github:acme/mail', 'npm:@acme/mail'],
      trustedContent: { 'github:acme/mail': [OTHER_HASH], 'npm:@acme/mail': [OTHER_HASH] },
    }

    expect(judgeTrust(remote('github:acme/mail#v2'), trusted)).toEqual({
      kind: 'changed',
      trustedHash: OTHER_HASH,
    })
    expect(judgeTrust(remote('npm:@acme/mail@^2'), trusted)).toEqual({
      kind: 'changed',
      trustedHash: OTHER_HASH,
    })
  })
})
