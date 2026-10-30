import { describe, expect, it } from 'vitest'

import { createBuiltDependencies } from '../plugin-definition/built-dependencies.ts'
import { definePlugin } from '../plugin-definition/define-plugin.ts'
import { optional } from '../plugin-definition/optional.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { createProject } from '../project-model/project.ts'
import { createCspSources, csp, orm } from '../test-support/fixture-points.ts'
import { type AssemblyInput, assembleProject } from './assemble-project.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const BASE_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify(
    {
      name: 'app',
      scripts: { dev: 'next dev' },
      dependencies: { next: '16.1.0' },
    },
    null,
    2,
  )}\n`,
  'tsconfig.json': `${JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }, null, 2)}\n`,
  '.gitignore': '/node_modules\n',
  '.env.example': '# Copy this file to .env and fill in the values.\n',
  'README.md': source(
    '# app',
    '',
    '## Scripts',
    '',
    '| Script | Command |',
    '| --- | --- |',
    '| `dev` | `next dev` |',
  ),
  '@/app/globals.css': 'body {\n  margin: 0;\n}\n',
  '@/app/layout.tsx': source(
    'import type { Metadata } from "next";',
    'import "./globals.css";',
    '',
    'export const metadata: Metadata = {',
    '  title: "app",',
    '};',
    '',
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    '  return (',
    '    <html lang="en">',
    '      <body>',
    '        {children}',
    '      </body>',
    '    </html>',
    '  );',
    '}',
  ),
  'next.config.ts': source(
    'import type { NextConfig } from "next";',
    '',
    'const nextConfig: NextConfig = {};',
    '',
    'export default nextConfig;',
  ),
}

const ORM_VALUE = {
  kind: 'drizzle',
  dialect: 'sqlite',
  client: { name: 'db', from: '@/db' },
} as const

const CATEGORY_ORDER = [
  'package-manager',
  'orm',
  'auth',
  'security-headers',
  'logging',
  'analytics',
  'agents',
]

/** A plugin whose directory holds `files`. */
const withFiles = (plugin: Plugin, files: Record<string, string> = {}) => ({
  plugin,
  readFile: (path: string): string => {
    const text = files[path]
    if (text === undefined) {
      throw new Error(`${plugin.name} has no file ${path}`)
    }
    return text
  },
})

type Options = Partial<Omit<AssemblyInput, 'project' | 'plugins'>> & {
  isSrcDirectory?: boolean
  alias?: string
}

const assemble = (plugins: AssemblyInput['plugins'], options: Options = {}) => {
  const { isSrcDirectory = false, alias = '@/*', ...input } = options
  return assembleProject({
    project: createProject({
      files: new Map(Object.entries(BASE_FILES)),
      settings: { alias, isSrcDirectory },
    }),
    plugins,
    categoryOrder: CATEGORY_ORDER,
    ...input,
  })
}

const fileOf = (files: ReadonlyMap<string, string>, path: string): string => {
  const text = files.get(path)
  if (text === undefined) {
    throw new Error(`no ${path} among ${[...files.keys()].join(', ')}`)
  }
  return text
}

describe('assembleProject', () => {
  it('returns the base files unchanged without plugins', () => {
    const { files } = assemble([])

    expect(Object.fromEntries(files)).toEqual(
      Object.fromEntries(
        Object.entries(BASE_FILES).map(([path, text]) => [path.replace('@/', ''), text]),
      ),
    )
  })

  it('applies the package, environment and text fields to the models', () => {
    const pino = definePlugin({
      name: 'pino',
      title: 'Logging with pino',
      category: 'logging',
      dependencies: { pino: '10.0.0' },
      devDependencies: () => ({ 'pino-pretty': '13.0.0' }),
      scripts: { 'logs:pretty': 'pino-pretty' },
      env: {
        LOG_LEVEL: {
          scope: 'server',
          description: 'The lowest level.',
          example: 'info',
        },
      },
      gitignore: ['/logs'],
      readme: { Logging: 'pino writes JSON lines.' },
      css: { imports: ['pino.css'] },
      instrumentation: {
        onRequestError: [{ module: '@/lib/logger', export: 'reportRequestError' }],
      },
    })

    const { files } = assemble([withFiles(pino)])
    const packageJson = JSON.parse(fileOf(files, 'package.json'))
    expect(packageJson.dependencies).toEqual({
      next: '16.1.0',
      pino: '10.0.0',
    })
    expect(packageJson.devDependencies).toEqual({ 'pino-pretty': '13.0.0' })
    expect(packageJson.scripts).toEqual({
      dev: 'next dev',
      'logs:pretty': 'pino-pretty',
    })
    expect(fileOf(files, '.env.example')).toBe(
      source(
        '# Copy this file to .env and fill in the values.',
        '',
        '# Logging with pino',
        '# The lowest level.',
        'LOG_LEVEL=info',
      ),
    )
    expect(fileOf(files, '.gitignore')).toBe('/node_modules\n/logs\n')
    expect(fileOf(files, 'README.md')).toContain('| `logs:pretty` | `pino-pretty` |')
    expect(fileOf(files, 'README.md')).toMatch(/## Logging\n\npino writes JSON lines\.\n$/)
    expect(fileOf(files, 'app/globals.css')).toBe('@import "pino.css";\nbody {\n  margin: 0;\n}\n')
    expect(fileOf(files, 'instrumentation.ts')).toContain(
      'await (await import("@/lib/logger")).reportRequestError(error, request, context);',
    )
  })

  it('edits the root layout and next.config.ts through their fields', () => {
    const themes = definePlugin({
      name: 'next-themes',
      title: 'next-themes',
      layout: {
        imports: [{ names: ['ThemeProvider'], from: '@/components/theme-provider' }],
        wrapChildren: {
          component: 'ThemeProvider',
          props: { attribute: 'class' },
        },
        htmlAttributes: { suppressHydrationWarning: true },
        metadata: { description: '"Themed"' },
      },
    })
    const analytics = definePlugin({
      name: 'analytics',
      title: 'Analytics',
      layout: {
        imports: [{ names: ['Analytics'], from: '@vercel/analytics/next' }],
        appendToBody: ['<Analytics />'],
      },
      nextConfig: {
        imports: [{ from: '@next/mdx', defaultName: 'createMDX' }],
        options: { reactCompiler: 'true' },
        wrap: ['withAnalytics'],
      },
    })

    const { files } = assemble([withFiles(themes), withFiles(analytics)])
    expect(fileOf(files, 'app/layout.tsx')).toBe(
      source(
        'import type { Metadata } from "next";',
        'import { ThemeProvider } from "@/components/theme-provider";',
        'import { Analytics } from "@vercel/analytics/next";',
        'import "./globals.css";',
        '',
        'export const metadata: Metadata = {',
        '  title: "app",',
        '  description: "Themed",',
        '};',
        '',
        'export default function RootLayout({ children }: LayoutProps<"/">) {',
        '  return (',
        '    <html lang="en" suppressHydrationWarning>',
        '      <body>',
        '        <ThemeProvider attribute="class">',
        '          {children}',
        '        </ThemeProvider>',
        '        <Analytics />',
        '      </body>',
        '    </html>',
        '  );',
        '}',
      ),
    )
    expect(fileOf(files, 'next.config.ts')).toBe(
      source(
        'import type { NextConfig } from "next";',
        'import createMDX from "@next/mdx";',
        '',
        'const nextConfig: NextConfig = {',
        '  reactCompiler: true,',
        '};',
        '',
        'export default withAnalytics(nextConfig);',
      ),
    )
  })

  it('wraps a component inside another whatever the order of their plugins', () => {
    const query = definePlugin({
      name: 'query',
      title: 'Query',
      layout: {
        wrapChildren: { component: 'QueryProvider', inside: 'ThemeProvider' },
      },
    })
    const themes = definePlugin({
      name: 'themes',
      title: 'Themes',
      layout: { wrapChildren: { component: 'ThemeProvider' } },
    })

    const layout = fileOf(assemble([withFiles(query), withFiles(themes)]).files, 'app/layout.tsx')
    expect(layout.indexOf('<ThemeProvider>')).toBeLessThan(layout.indexOf('<QueryProvider>'))
  })

  it('copies files to source paths under src/, rewriting @/ imports to the alias', () => {
    const auth = definePlugin({
      name: 'auth',
      title: 'Auth',
      files: {
        '@/lib/auth.ts': 'files/auth.ts',
        'auth.config.ts': 'files/config.ts',
      },
    })

    const { files } = assemble(
      [
        withFiles(auth, {
          'files/auth.ts': 'import { db } from "@/db";\n',
          'files/config.ts': 'export default {};\n',
        }),
      ],
      { isSrcDirectory: true, alias: '~/*' },
    )
    expect(fileOf(files, 'src/lib/auth.ts')).toBe('import { db } from "~/db";\n')
    expect(fileOf(files, 'auth.config.ts')).toBe('export default {};\n')
  })

  it('hands the provider’s value of a point to the plugins that use it', () => {
    const drizzle = definePlugin({
      name: 'drizzle',
      title: 'Drizzle',
      category: 'orm',
      provides: { orm: () => ORM_VALUE },
    })
    const auth = definePlugin({
      name: 'auth',
      title: 'Auth',
      category: 'auth',
      uses: { orm },
      dependencies: ({ orm }) => ({ [`${orm.kind}-adapter`]: '1.0.0' }),
      files: {
        '@/lib/auth.ts': {
          source: 'files/auth.ts',
          edit: (module, { orm }) =>
            module.addImport({
              names: [orm.client.name],
              from: orm.client.from,
            }),
        },
      },
    })

    const { files } = assemble([
      withFiles(auth, { 'files/auth.ts': 'export const auth = {};\n' }),
      withFiles(drizzle),
    ])
    expect(JSON.parse(fileOf(files, 'package.json')).dependencies['drizzle-adapter']).toBe('1.0.0')
    expect(fileOf(files, 'lib/auth.ts')).toBe(
      'import { db } from "@/db";\n\nexport const auth = {};\n',
    )
  })

  it('reads an optional point as undefined without a provider', () => {
    const analytics = definePlugin({
      name: 'analytics',
      title: 'Analytics',
      uses: { csp: optional(csp) },
      gitignore: ({ csp }) => [csp === undefined ? '/no-csp' : '/csp'],
    })

    expect(fileOf(assemble([withFiles(analytics)]).files, '.gitignore')).toContain('/no-csp')
  })

  it('finishes what a collector point collected into the provider’s file', () => {
    const headers = definePlugin({
      name: 'headers',
      title: 'Security headers',
      category: 'security-headers',
      files: { 'security-headers.ts': 'files/security-headers.ts' },
      collects: {
        csp: {
          create: createCspSources,
          finish: (sources, { module }) => {
            const directives = module('security-headers.ts').object('directives')
            for (const [directive, allowed] of sources.directives()) {
              directives.addToArray(directive, ...allowed.map((value) => JSON.stringify(value)))
            }
          },
        },
      },
    })
    const analytics = definePlugin({
      name: 'analytics',
      title: 'Analytics',
      category: 'analytics',
      extend: {
        csp: (sources) => sources.allow('script-src', 'https://va.vercel-scripts.com'),
      },
    })

    const { files, provenance } = assemble([
      withFiles(analytics),
      withFiles(headers, {
        'files/security-headers.ts': 'export const directives = {};\n',
      }),
    ])
    expect(fileOf(files, 'security-headers.ts')).toBe(
      source(
        'export const directives = {',
        '  "script-src": ["https://va.vercel-scripts.com"],',
        '};',
      ),
    )
    expect(provenance.points.csp).toEqual({
      provider: 'headers',
      users: [],
      contributors: ['analytics'],
    })
  })

  it('records the package manager in package.json and the README’s run command', () => {
    const pnpm = definePlugin({
      name: 'pnpm',
      title: 'pnpm',
      category: 'package-manager',
      packageManager: {
        version: '12.16.1',
        ciInstallArgs: ['install', '--frozen-lockfile'],
        whenVersionDiffers: 'download',
      },
    })
    const base = {
      ...BASE_FILES,
      'README.md': source('# app', '', '```bash', 'npm run dev', '```'),
    }

    const { files } = assembleProject({
      project: createProject({
        files: new Map(Object.entries(base)),
        settings: { alias: '@/*', isSrcDirectory: false },
      }),
      plugins: [withFiles(pnpm)],
      categoryOrder: CATEGORY_ORDER,
    })

    expect(JSON.parse(fileOf(files, 'package.json'))).toMatchObject({
      packageManager: 'pnpm@12.16.1',
      devEngines: { packageManager: { name: 'pnpm', version: '^12.16.1', onFail: 'download' } },
    })
    expect(fileOf(files, 'README.md')).toContain('pnpm run dev')
  })

  it('lets the package manager finish the built dependencies into package.json', () => {
    const bun = definePlugin({
      name: 'bun',
      title: 'Bun',
      category: 'package-manager',
      collects: {
        builtDependencies: {
          create: createBuiltDependencies,
          finish: (builds, { packageJson }) =>
            packageJson.setField('trustedDependencies', [...builds.allowed()]),
        },
      },
    })
    const sharp = definePlugin({
      name: 'sharp',
      title: 'Sharp',
      category: 'orm',
      extend: {
        builtDependencies: (builds) => {
          builds.allow('sharp')
          builds.deny('esbuild')
        },
      },
    })

    const { files, provenance } = assemble([withFiles(sharp), withFiles(bun)])

    expect(JSON.parse(fileOf(files, 'package.json')).trustedDependencies).toEqual(['sharp'])
    expect(provenance.files['package.json']).toContainEqual({
      plugin: 'bun',
      operation: 'finish builtDependencies: field trustedDependencies',
      kind: 'extend',
    })
  })

  it('answers who owns each file', () => {
    const auth = definePlugin({
      name: 'auth',
      title: 'Auth',
      category: 'auth',
      files: { '@/lib/auth.ts': 'files/auth.ts' },
    })

    const { owners } = assemble([withFiles(auth, { 'files/auth.ts': 'export {};\n' })])

    expect(owners.get('lib/auth.ts')).toBe('auth')
    expect(owners.get('package.json')).toBe('base')
  })

  it('applies the base settings before the plugins, agent rules off without an agents plugin', () => {
    const headers = definePlugin({
      name: 'headers',
      title: 'Headers',
      category: 'security-headers',
      nextConfig: { options: { headers: 'async () => []' } },
    })
    const settings = {
      projectName: 'app',
      importAlias: '@/*',
      isSrcDirectory: false,
      usesReactCompiler: false,
      usesCacheComponents: true,
    }
    const agents = definePlugin({ name: 'agents-md', title: 'AGENTS.md', category: 'agents' })

    const base = {
      ...BASE_FILES,
      '@/app/layout.tsx': fileOf(new Map(Object.entries(BASE_FILES)), '@/app/layout.tsx').replace(
        'title: "app"',
        'title: { default: "next-suite-app", template: "%s" }',
      ),
      '@/app/page.tsx': 'export default () => <h1>next-suite-app</h1>;\n',
    }
    const assembleWith = (plugins: AssemblyInput['plugins']) =>
      assembleProject({
        project: createProject({
          files: new Map(Object.entries(base)),
          settings: { alias: '@/*', isSrcDirectory: false },
        }),
        plugins,
        categoryOrder: CATEGORY_ORDER,
        baseSettings: settings,
      })

    const without = assembleWith([withFiles(headers)])
    const withAgents = assembleWith([withFiles(headers), withFiles(agents)])

    expect(fileOf(without.files, 'next.config.ts')).toContain(
      source(
        'const nextConfig: NextConfig = {',
        '  agentRules: false,',
        '  cacheComponents: true,',
        '  partialPrefetching: true,',
        '  headers: async () => [],',
        '};',
      ),
    )
    expect(fileOf(withAgents.files, 'next.config.ts')).not.toContain('agentRules')
  })

  it('drops contributions to a collector point nobody provides', () => {
    const analytics = definePlugin({
      name: 'analytics',
      title: 'Analytics',
      extend: {
        csp: (sources) => sources.allow('script-src', 'https://example.com'),
      },
    })

    expect(() => assemble([withFiles(analytics)])).not.toThrow()
  })

  it('runs the phases in order: collect, extend, own edits, finish, direct edits', () => {
    const calls: string[] = []
    const provider = definePlugin({
      name: 'provider',
      title: 'Provider',
      category: 'security-headers',
      files: {
        'headers.ts': {
          source: 'files/headers.ts',
          edit: () => {
            calls.push('provider: own edit')
          },
        },
      },
      collects: {
        csp: {
          create: () => {
            calls.push('provider: create')
            return createCspSources()
          },
          finish: () => {
            calls.push('provider: finish')
          },
        },
      },
      edit: {
        'next.config.ts': () => {
          calls.push('provider: direct edit')
        },
      },
    })
    const user = definePlugin({
      name: 'user',
      title: 'User',
      category: 'analytics',
      scripts: () => {
        calls.push('user: collect')
        return {}
      },
      extend: {
        csp: () => {
          calls.push('user: extend')
        },
      },
      edit: {
        'headers.ts': () => {
          calls.push('user: direct edit')
        },
      },
    })

    assemble([withFiles(user), withFiles(provider, { 'files/headers.ts': 'export {};\n' })])
    expect(calls).toEqual([
      'provider: create',
      'user: collect',
      'user: extend',
      'provider: own edit',
      'provider: finish',
      'provider: direct edit',
      'user: direct edit',
    ])
  })

  it('gives edits every environment variable and the files of others', () => {
    const t3Env = definePlugin({
      name: 't3-env',
      title: 't3-env',
      files: {
        '@/env.ts': {
          source: 'files/env.ts',
          edit: (module, { env }) => {
            for (const variable of env) {
              module.object('env').object(variable.scope).set(variable.name, 'z.string()')
            }
          },
        },
      },
    })
    const pino = definePlugin({
      name: 'pino',
      title: 'pino',
      env: { LOG_LEVEL: { scope: 'server', description: 'The level.' } },
    })

    const { files } = assemble([
      withFiles(t3Env, {
        'files/env.ts': 'export const env = createEnv({});\n',
      }),
      withFiles(pino),
    ])
    expect(fileOf(files, 'env.ts')).toContain('LOG_LEVEL: z.string(),')
  })

  it('records each operation with its plugin and whether it was own, an extension or direct', () => {
    const pino = definePlugin({
      name: 'pino',
      title: 'pino',
      dependencies: { pino: '10.0.0' },
      files: {
        '@/lib/logger.ts': { source: 'files/logger.ts', edit: () => undefined },
      },
    })
    const tweaks = definePlugin({
      name: 'tweaks',
      title: 'My tweaks',
      edit: {
        '@/lib/logger.ts': (module) => module.object('logger').set('timestamp', 'true'),
      },
      setup: (project) => project.packageJson.setField('engines', { node: '>=24' }),
    })

    const { provenance } = assemble([
      withFiles(pino, {
        'files/logger.ts': 'export const logger = pino({});\n',
      }),
      withFiles(tweaks),
    ])
    expect(provenance.order).toEqual(['pino', 'tweaks'])
    expect(provenance.files['lib/logger.ts']).toEqual([
      { plugin: 'pino', operation: 'copy files/logger.ts', kind: 'own' },
      { plugin: 'pino', operation: 'edit', kind: 'own' },
      { plugin: 'tweaks', operation: 'edit (a file of pino)', kind: 'direct' },
    ])
    expect(provenance.files['package.json']).toEqual([
      { plugin: 'base', operation: 'base', kind: 'own' },
      { plugin: 'pino', operation: 'dependencies pino', kind: 'extend' },
      { plugin: 'tweaks', operation: 'setup: field engines', kind: 'extend' },
    ])
  })

  it('names the plugin and the file of an edit that does not find its place', () => {
    const tweaks = definePlugin({
      name: 'tweaks',
      title: 'Tweaks',
      edit: {
        'next.config.ts': (module) => module.object('missing').set('a', '1'),
      },
    })

    expect(() => assemble([withFiles(tweaks)])).toThrow(
      /^tweaks \(edit of next\.config\.ts\): next\.config\.ts: /,
    )
  })

  it('names the plugin whose field function or answers fail', () => {
    const sentry = definePlugin({
      name: 'sentry',
      title: 'Sentry',
      dependencies: ({ versionOf }) => ({ '@sentry/react': versionOf('react') }),
    })
    const pino = definePlugin({
      name: 'pino',
      title: 'pino',
      options: { level: { question: 'Level?', choices: ['info'], default: 'info' } },
      gitignore: ['/logs'],
    })

    expect(() => assemble([withFiles(sentry)])).toThrow(
      'sentry (dependencies): package.json has no dependency react',
    )
    expect(() => assemble([withFiles(pino)], { answers: { pino: { level: 'trace' } } })).toThrow(
      '"trace" is no answer to pino\'s level; choose one of info',
    )
  })

  it('names the plugin that edits a file nobody writes', () => {
    const tweaks = definePlugin({
      name: 'tweaks',
      title: 'Tweaks',
      edit: { '@/lib/logger.ts': () => undefined },
    })

    expect(() => assemble([withFiles(tweaks)])).toThrow(
      'tweaks (edit of @/lib/logger.ts): The project has no lib/logger.ts',
    )
  })

  it('names both plugins that write one file', () => {
    const first = definePlugin({
      name: 'first',
      title: 'F',
      files: { '@/lib/a.ts': 'a.ts' },
    })
    const second = definePlugin({
      name: 'second',
      title: 'S',
      files: { 'lib/a.ts': 'a.ts' },
    })

    expect(() =>
      assemble([withFiles(first, { 'a.ts': '' }), withFiles(second, { 'a.ts': '' })]),
    ).toThrow('first and second both write lib/a.ts')
  })

  it('answers has() for the plugins that run, not for a replaced one', () => {
    const seen: Record<string, boolean> = {}
    const original = definePlugin({ name: 'static-csp', title: 'S' })
    const replacement = definePlugin({
      name: 'my-csp',
      title: 'M',
      replaces: 'static-csp',
    })
    const probe = definePlugin({
      name: 'probe',
      title: 'Probe',
      scripts: ({ has }) => {
        seen.original = has('static-csp')
        seen.replacement = has('my-csp')
        return {}
      },
    })

    assemble([withFiles(original), withFiles(replacement), withFiles(probe)])
    expect(seen).toEqual({ original: false, replacement: true })
  })

  it('gives each plugin its answers, the defaults filled in', () => {
    const pino = definePlugin({
      name: 'pino',
      title: 'pino',
      options: {
        level: {
          question: 'Level?',
          choices: ['debug', 'info'],
          default: 'info',
        },
        pretty: { type: 'boolean', question: 'Pretty?', default: false },
      },
      env: ({ options }) => ({
        LOG_LEVEL: {
          scope: 'server',
          description: `pretty: ${options.pretty}`,
          example: options.level,
        },
      }),
    })

    const { files } = assemble([withFiles(pino)], {
      answers: { pino: { level: 'debug' } },
    })
    expect(fileOf(files, '.env.example')).toContain('# pretty: false\nLOG_LEVEL=debug')
  })

  it('gives functions the helpers of the context', () => {
    const drizzle = definePlugin({
      name: 'drizzle',
      title: 'Drizzle',
      files: ({ diskPath, versionOf }) => ({
        'drizzle.config.ts': 'files/config.ts',
        [`@/db/${versionOf('next')}.ts`]: 'files/config.ts',
        [`@/${diskPath('@/db/schema').replaceAll('/', '-')}.ts`]: 'files/config.ts',
      }),
      readme: ({ readFile }) => ({ Database: readFile('files/readme.md') }),
    })

    const { files } = assemble(
      [
        withFiles(drizzle, {
          'files/config.ts': 'export {};\n',
          'files/readme.md': 'Drizzle.',
        }),
      ],
      { isSrcDirectory: true },
    )
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['drizzle.config.ts', 'src/db/16.1.0.ts', 'src/src-db-schema.ts']),
    )
    expect(fileOf(files, 'README.md')).toContain('## Database\n\nDrizzle.')
  })

  it('lets setup write files, edit modules and add tsconfig entries, recorded as setup', () => {
    const blog = definePlugin({
      name: 'blog',
      title: 'Blog',
      setup: (project) => {
        project.tsconfig.addPath('#content/*', ['./content/*'])
        project.tsconfig.addInclude('content/**/*.ts')
        project.write('content/index.ts', 'export const posts = [];\n')
        project
          .module('next.config.ts')
          .defaultExportObject()
          .set('pageExtensions', '["ts", "tsx", "mdx"]')
      },
    })

    const { files, provenance } = assemble([withFiles(blog)])
    expect(JSON.parse(fileOf(files, 'tsconfig.json')).compilerOptions.paths).toEqual({
      '#content/*': ['./content/*'],
      '@/*': ['./*'],
    })
    expect(fileOf(files, 'content/index.ts')).toBe('export const posts = [];\n')
    expect(fileOf(files, 'next.config.ts')).toContain('pageExtensions: ["ts", "tsx", "mdx"],')
    expect(provenance.files['next.config.ts']).toContainEqual({
      plugin: 'blog',
      operation: 'setup: module',
      kind: 'direct',
    })
  })

  it('ignores generated directories after every plugin and hands them to finish', () => {
    let finished: readonly string[] = []
    const orm = definePlugin({
      name: 'prisma',
      title: 'Prisma',
      category: 'logging',
      generatedDirectories: ['@/generated', 'prisma/client'],
      gitignore: ['/prisma/dev.db'],
      collects: {
        builtDependencies: {
          create: createBuiltDependencies,
          finish: (_builds, { generatedDirectories }) => {
            finished = generatedDirectories
          },
        },
      },
    })
    const later = definePlugin({
      name: 'later',
      title: 'Later',
      category: 'agents',
      generatedDirectories: () => ['@/generated'],
      gitignore: ['/later'],
    })

    const { files } = assemble([withFiles(later), withFiles(orm)], { isSrcDirectory: true })
    expect(fileOf(files, '.gitignore')).toBe(
      '/node_modules\n/prisma/dev.db\n/later\n/src/generated\n/prisma/client\n',
    )
    expect(finished).toEqual(['src/generated', 'prisma/client'])
  })

  it('collects the stack, next steps and post-steps in plugin order', () => {
    const linter = definePlugin({
      name: 'eslint',
      title: 'ESLint',
      category: 'logging',
      scripts: { lint: 'eslint' },
      stack: ['ESLint'],
      nextSteps: [{ script: 'lint' }, { command: 'docker compose up -d' }],
    })
    const hooks = definePlugin({
      name: 'hooks',
      title: 'Hooks',
      category: 'agents',
      scripts: { prepare: 'husky' },
      stack: () => ['Husky', 'ESLint'],
      postSteps: [
        { script: 'prepare', running: 'Setting up Git hooks', when: (run) => run.initializesGit },
        { script: 'dev' },
      ],
    })

    const { runSteps } = assemble([withFiles(hooks), withFiles(linter)])
    expect(runSteps.stack).toEqual(['ESLint', 'Husky'])
    expect(runSteps.nextSteps).toEqual([{ script: 'lint' }, { command: 'docker compose up -d' }])
    expect(
      runSteps.postSteps.map(({ script, running, done }) => ({ script, running, done })),
    ).toEqual([
      { script: 'prepare', running: 'Setting up Git hooks', done: 'Ran prepare' },
      { script: 'dev', running: 'Running dev', done: 'Ran dev' },
    ])
    const [prepare, dev] = runSteps.postSteps
    expect(prepare?.runsFor({ initializesGit: false })).toBe(false)
    expect(prepare?.runsFor({ initializesGit: true })).toBe(true)
    expect(dev?.runsFor({ initializesGit: false })).toBe(true)
  })

  it('refuses a next step or post-step that names a missing script', () => {
    const suggesting = definePlugin({
      name: 'suggesting',
      title: 'Suggesting',
      nextSteps: [{ script: 'db:migrate' }],
    })
    const running = definePlugin({
      name: 'running',
      title: 'Running',
      postSteps: [{ script: 'format' }],
    })

    expect(() => assemble([withFiles(suggesting)])).toThrow(
      'suggesting suggests the script "db:migrate", but no plugin defines it',
    )
    expect(() => assemble([withFiles(running)])).toThrow(
      'running runs the script after the install: "format", but no plugin defines it',
    )
  })

  it('writes the same output for the same input', () => {
    const plugins = () => [
      withFiles(
        definePlugin({
          name: 'pino',
          title: 'pino',
          dependencies: { pino: '10.0.0', abc: '1.0.0' },
          files: { '@/lib/logger.ts': 'logger.ts' },
        }),
        { 'logger.ts': 'export {};\n' },
      ),
    ]

    const first = assemble(plugins())
    const second = assemble(plugins())
    expect([...first.files]).toEqual([...second.files])
    expect(first.provenance).toEqual(second.provenance)
  })
})
