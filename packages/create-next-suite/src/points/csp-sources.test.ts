import { describe, expect, it } from 'vitest'

import { createCspSources } from './csp-sources.ts'

describe('createCspSources', () => {
  it('keeps each directive with its sources in the order they were first allowed', () => {
    const csp = createCspSources()
    csp.allow('script-src', 'https://va.vercel-scripts.com')
    csp.allow('connect-src', 'https://vitals.vercel-insights.com')
    csp.allow('script-src', 'https://va.vercel-scripts.com', 'https://plausible.io')

    expect(csp.directives()).toEqual(
      new Map([
        ['script-src', ['https://va.vercel-scripts.com', 'https://plausible.io']],
        ['connect-src', ['https://vitals.vercel-insights.com']],
      ]),
    )
  })
})
