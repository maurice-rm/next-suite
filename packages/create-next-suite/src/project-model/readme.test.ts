import { describe, expect, it } from 'vitest'

import { openReadme } from './readme.ts'

const BASE = [
  '# next-suite-app',
  '',
  '## Scripts',
  '',
  '| Script | Command |',
  '| --- | --- |',
  '| `dev` | `next dev` |',
  '',
  '## Learn more',
  '',
  'Read the docs.',
  '',
].join('\n')

describe('openReadme', () => {
  it('lists the final scripts and appends the sections in order', () => {
    const readme = openReadme(BASE)
    readme.addSection('Logging', 'pino logs.', 'pino')
    readme.addSection('Security headers', 'A CSP.', 'static-csp')

    expect(readme.print({ dev: 'next dev', test: 'vitest' })).toBe(
      [
        '# next-suite-app',
        '',
        '## Scripts',
        '',
        '| Script | Command |',
        '| --- | --- |',
        '| `dev` | `next dev` |',
        '| `test` | `vitest` |',
        '',
        '## Learn more',
        '',
        'Read the docs.',
        '',
        '## Logging',
        '',
        'pino logs.',
        '',
        '## Security headers',
        '',
        'A CSP.',
        '',
      ].join('\n'),
    )
  })

  it('prints an unchanged README as it was', () => {
    expect(openReadme(BASE).print({ dev: 'next dev' })).toBe(BASE)
  })

  it('leaves a README without a scripts section as it was, but for the sections', () => {
    const readme = openReadme('# App\n')
    readme.addSection('Logging', 'pino logs.', 'pino')

    expect(readme.print({ dev: 'next dev' })).toBe('# App\n\n## Logging\n\npino logs.\n')
  })

  it('names both origins of a section title', () => {
    const readme = openReadme(BASE)
    readme.addSection('Logging', 'pino logs.', 'pino')

    expect(() => readme.addSection('Logging', 'winston logs.', 'winston')).toThrow(
      'pino and winston both add the README section "Logging"',
    )
  })
})
