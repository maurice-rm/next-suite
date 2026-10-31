import { definePlugin, optional } from 'create-next-suite/plugin'
import { type CspSources, csp, type KnipOptions, logRedact } from 'create-next-suite/points'
import { describe, expectTypeOf, it } from 'vitest'

const NAMES = { name: 'acme-analytics', title: 'Acme Analytics' }

describe('an external plugin against the published types', () => {
  it('contributes to the points of the built-in plugins under extend', () => {
    definePlugin({
      ...NAMES,
      uses: { csp: optional(csp), logRedact: optional(logRedact) },
      extend: {
        csp: (sources, { csp: isCollected }) => {
          expectTypeOf(sources).toEqualTypeOf<CspSources>()
          expectTypeOf(isCollected).toEqualTypeOf<true | undefined>()
          sources.allow('connect-src', 'https://api.acme.dev')
        },
        knip: (knip, { diskPath }) => {
          expectTypeOf(knip).toEqualTypeOf<KnipOptions>()
          knip.entry(diskPath('@/lib/acme-client.ts'))
        },
        logRedact: (redact) => redact.redact('req.headers.authorization'),
        lintStaged: (lintStaged) => lintStaged.run('*.md', 'markdownlint --fix'),
        prettierPlugins: (plugins) => plugins.add('prettier-plugin-acme'),
        testSetup: (setup) => setup.add('acme.setup.ts'),
        agents: (agents) => agents.addSection('Acme', 'Track events through `lib/acme`.'),
        ciChecks: (checks) => checks.run('acme:check'),
      },
    })
  })

  it('refuses a contribution of the wrong type', () => {
    definePlugin({
      ...NAMES,
      extend: {
        // @ts-expect-error -- the sources of a directive are strings, not a list
        csp: (sources) => sources.allow('connect-src', ['https://api.acme.dev']),
        // @ts-expect-error -- Knip's entry files are paths, not a number
        knip: (knip) => knip.entry(1),
        // @ts-expect-error -- a section of AGENTS.md takes a title and a text
        agents: (agents) => agents.addSection('Acme'),
      },
    })
  })
})
