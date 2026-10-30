import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { assembleProject } from '../../assembly/assemble-project.ts'
import { loadBaseProject } from '../../loader/load-base-project.ts'
import { loadGroupedPluginModules } from '../../loader/load-grouped-plugin-modules.ts'
import type { LoadedPluginModule } from '../../loader/load-plugin-module.ts'
import { CATEGORIES } from '../../plugin-definition/categories.ts'
import type { Plugin } from '../../plugin-definition/plugin-definition.ts'
import { createProject } from '../../project-model/project.ts'

const PACKAGE_ROOT = new URL('../../../', import.meta.url)
const PLUGIN_ENTRY = fileURLToPath(new URL('../../plugin.ts', import.meta.url))

type CspSources = { allow: (directive: string, ...sources: string[]) => void }
type LogRedact = { redact: (...paths: string[]) => void }
type TestSetup = { add: (...paths: string[]) => void }
type AgentSections = { addSection: (title: string, text: string) => void }
type CiChecks = { run: (script: string) => void }

/**
 * An extra that contributes to the points of the app plugins, the way an analytics or an auth
 * plugin will; written as the core runs it, since the points of built-in plugins are typed only
 * for plugins.
 */
const CONTRIBUTOR: Plugin = {
  name: 'contributor',
  title: 'Contributor',
  scripts: { 'e2e:check': 'playwright test' },
  extend: {
    csp: (sources) => {
      const csp = sources as CspSources
      csp.allow('script-src', 'https://va.vercel-scripts.com', "'self'")
      csp.allow('connect-src', 'https://vitals.vercel-insights.com')
    },
    logRedact: (redact) => (redact as LogRedact).redact('req.body.password'),
    testSetup: (setup) => (setup as TestSetup).add('vitest.setup.ts'),
    agents: (agents) =>
      (agents as AgentSections).addSection('Database', 'Run `db:migrate` after a schema change.'),
    ciChecks: (checks) => (checks as CiChecks).run('e2e:check'),
  },
}

let builtIn: LoadedPluginModule[]
let baseFiles: Map<string, string>

const assembleWith = (
  names: readonly string[],
  extras: readonly Plugin[] = [CONTRIBUTOR],
): Map<string, string> => {
  const plugins = [
    ...names.map((name) => {
      const found = builtIn.find(({ plugin }) => plugin.name === name)
      if (found === undefined) {
        throw new Error(`no built-in plugin ${name}`)
      }
      return found
    }),
    ...extras.map((plugin) => ({ plugin, readFile: () => '' })),
  ]
  return assembleProject({
    project: createProject({ files: baseFiles, settings: { alias: '@/*', isSrcDirectory: false } }),
    plugins,
    categoryOrder: CATEGORIES.map(({ id }) => id),
  }).files
}

const fileOf = (files: ReadonlyMap<string, string>, path: string): string => {
  const text = files.get(path)
  if (text === undefined) {
    throw new Error(`no ${path}`)
  }
  return text
}

beforeAll(async () => {
  builtIn = await loadGroupedPluginModules(
    fileURLToPath(new URL('plugins-v2', PACKAGE_ROOT)),
    PLUGIN_ENTRY,
  )
  baseFiles = await loadBaseProject(fileURLToPath(new URL('base-project', PACKAGE_ROOT)))
})

describe('the app plugins written as plugin.ts', () => {
  it('write what other plugins contribute into their files', () => {
    const files = assembleWith([
      'bun',
      'vitest',
      'pino',
      'static-csp',
      'github-actions',
      'agents-md',
    ])

    expect(fileOf(files, 'security-headers.ts')).toContain(
      [
        '  "script-src": [',
        `    "'self'",`,
        `    "'unsafe-inline'",`,
        '    "https://va.vercel-scripts.com",',
        '  ],',
      ].join('\n'),
    )
    expect(fileOf(files, 'security-headers.ts')).toContain(
      '  "connect-src": [\n    "https://vitals.vercel-insights.com",\n  ],\n};\n',
    )
    expect(fileOf(files, 'lib/logger.ts')).toContain(
      '    "req.headers.cookie",\n    "req.body.password",\n  ],',
    )
    expect(fileOf(files, 'vitest.config.mts')).toContain(
      '    setupFiles: [\n      "vitest.setup.ts",\n    ],',
    )
    expect(fileOf(files, 'AGENTS.md')).toMatch(
      /- `bun run e2e:check`: `playwright test`\n\n## Database\n\nRun `db:migrate` after a schema change\.\n$/,
    )
    expect(fileOf(files, '.github/workflows/ci.yml')).toContain(
      [
        '      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0',
        '        with:',
        '          bun-version: 1.4.4',
        '      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
      ].join('\n'),
    )
    expect(fileOf(files, '.github/workflows/ci.yml')).toMatch(
      /- run: bun install --frozen-lockfile\n[\s\S]*- run: bun run typecheck\n {6}- run: bun run test\n {6}- run: bun run e2e:check\n {6}- run: bun run build\n$/,
    )
  })

  it('refuse a CI check that names no script of the project', () => {
    const checker: Plugin = {
      name: 'checker',
      title: 'Checker',
      extend: { ciChecks: (checks) => (checks as CiChecks).run('e2e') },
    }

    expect(() => assembleWith(['pnpm', 'github-actions'], [checker])).toThrow(
      'github-actions (finish ciChecks): CI runs the script "e2e", but no plugin defines it',
    )
  })
})
