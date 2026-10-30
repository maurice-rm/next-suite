import { describe, expect, it } from 'vitest'

import { CodeEditError } from '../code-edit/code-edit-error.ts'
import { createProject, PROJECT_FILES } from './project.ts'
import { ProjectError } from './project-error.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const LAYOUT = source(
  'import "./globals.css";',
  '',
  'export default function RootLayout({ children }: LayoutProps<"/">) {',
  '  return (',
  '    <html lang="en">',
  '      <body>{children}</body>',
  '    </html>',
  '  );',
  '}',
)

const NEXT_CONFIG = source(
  'import type { NextConfig } from "next";',
  '',
  'const nextConfig: NextConfig = {};',
  '',
  'export default nextConfig;',
)

const PACKAGE_JSON = `${JSON.stringify({ name: 'app', dependencies: { next: '16.1.0' } }, null, 2)}\n`

const BASE_FILES: [string, string][] = [
  ['package.json', PACKAGE_JSON],
  ['@/app/layout.tsx', LAYOUT],
  ['next.config.ts', NEXT_CONFIG],
  ['@/app/page.tsx', 'export default function Page() {\n  return null;\n}\n'],
]

const openProject = (settings: { alias?: string; isSrcDirectory?: boolean } = {}) =>
  createProject({
    files: new Map(BASE_FILES),
    settings: { alias: '@/*', isSrcDirectory: false, ...settings },
  })

describe('createProject', () => {
  it('prints the base files byte for byte when nothing changes, sorted by path', () => {
    const files = openProject().print()

    expect([...files.keys()]).toEqual([
      'app/layout.tsx',
      'app/page.tsx',
      'next.config.ts',
      'package.json',
    ])
    expect(files.get('app/layout.tsx')).toBe(LAYOUT)
    expect(files.get('package.json')).toBe(PACKAGE_JSON)
  })

  it('places source paths under src/ with --src-dir', () => {
    const files = openProject({ isSrcDirectory: true }).print()

    expect([...files.keys()]).toContain('src/app/layout.tsx')
    expect([...files.keys()]).toContain('next.config.ts')
  })

  it('records who wrote each file, the base files as the base’s', () => {
    const project = openProject()
    project.write('@/lib/auth.ts', 'export const auth = {};\n', 'better-auth')

    expect(project.ownerOf('@/app/page.tsx')).toBe('base')
    expect(project.ownerOf('lib/auth.ts')).toBe('better-auth')
    expect(project.ownerOf('@/lib/missing.ts')).toBeUndefined()
    expect(project.provenance.operationsOf('app/page.tsx')).toEqual([
      { plugin: 'base', operation: 'base', kind: 'own' },
    ])
  })

  it('names both owners when a second one writes a path, also through another spelling', () => {
    const project = openProject()
    project.write('@/lib/auth.ts', '', 'better-auth')

    expect(() => project.write('lib/auth.ts', '', 'clerk')).toThrow(ProjectError)
    expect(() => project.write('lib/auth.ts', '', 'clerk')).toThrow(
      'better-auth and clerk both write lib/auth.ts',
    )
    expect(() => project.write('@/app/page.tsx', '', 'landing')).toThrow(
      'base and landing both write app/page.tsx',
    )
  })

  it('refuses a path that could leave the project', () => {
    expect(() => openProject().write('../outside.ts', '', 'acme')).toThrow(
      'acme writes to "../outside.ts", which contains the segment ".."',
    )
  })

  it('refuses two paths that are one file on case-insensitive systems', () => {
    const project = openProject()
    project.write('@/app/Page.tsx', '', 'landing')

    expect(() => project.print()).toThrow(
      'base writes app/page.tsx and landing writes app/Page.tsx, one file on case-insensitive systems',
    )
  })

  it('parses a module once, so every edit works on the same text', () => {
    const project = openProject()
    project.write('@/lib/logger.ts', 'export const logger = pino({});\n', 'pino')
    project.module('@/lib/logger.ts').object('logger').set('level', '"info"')
    project.module('lib/logger.ts').object('logger').set('timestamp', 'true')

    expect(project.print().get('lib/logger.ts')).toBe(
      source('export const logger = pino({', '  level: "info",', '  timestamp: true,', '});'),
    )
  })

  it('refuses a module the project does not have, or that is no script', () => {
    const project = openProject()

    expect(() => project.module('@/lib/missing.ts')).toThrow('The project has no lib/missing.ts')
    expect(() => project.module('package.json')).toThrow(
      'package.json is no TypeScript or JavaScript module',
    )
  })

  it('opens the root layout as the module of its path', () => {
    const project = openProject()
    project.layout().setHtmlAttribute('suppressHydrationWarning', true)
    project
      .module(PROJECT_FILES.layout)
      .addImport({ from: '@/components/providers', names: ['Providers'] })

    const layout = project.print().get('app/layout.tsx')
    expect(layout).toContain('<html lang="en" suppressHydrationWarning>')
    expect(layout).toContain('import { Providers } from "@/components/providers";')
  })

  it('edits next.config.ts through its helpers', () => {
    const project = openProject()
    project.nextConfig().setOption('reactCompiler', 'true')

    expect(project.print().get('next.config.ts')).toContain('reactCompiler: true,')
  })

  it('prints the models it opened', () => {
    const project = openProject()
    project.packageJson().addDependency('pino', '10.0.0', 'pino')

    expect(JSON.parse(project.print().get('package.json') ?? '').dependencies).toEqual({
      next: '16.1.0',
      pino: '10.0.0',
    })
  })

  it('refuses a model whose file the project does not have', () => {
    expect(() => openProject().tsconfig()).toThrow('The project has no tsconfig.json')
  })

  it('writes .env.example and .gitignore only when something goes into them', () => {
    const untouched = openProject().print()
    expect(untouched.has('.env.example')).toBe(false)
    expect(untouched.has('.gitignore')).toBe(false)

    const project = openProject()
    project.environment.add(
      { name: 'LOG_LEVEL', scope: 'server', description: 'The level.', example: 'info' },
      { title: 'pino', origin: 'pino' },
    )
    project.gitignore().add('/coverage')
    const files = project.print()
    expect(files.get('.env.example')).toBe('# pino\n# The level.\nLOG_LEVEL=info\n')
    expect(files.get('.gitignore')).toBe('/coverage\n')
  })

  it('writes the instrumentation files only when a hook is contributed', () => {
    expect(openProject().print().has('instrumentation.ts')).toBe(false)

    const project = openProject({ isSrcDirectory: true })
    project.instrumentation.register({ module: '@/lib/otel' })
    project.instrumentation.addClient({ module: '@/lib/polyfills' })
    const files = project.print()
    expect(files.get('src/instrumentation.ts')).toContain('await import("@/lib/otel");')
    expect(files.get('src/instrumentation-client.ts')).toBe('import "@/lib/polyfills";\n')
  })

  it('names the plugin whose instrumentation.ts the core would write over', () => {
    const project = openProject()
    project.write('@/instrumentation.ts', 'export function register() {}\n', 'otel')
    project.instrumentation.register({ module: '@/lib/sentry' })

    expect(() => project.print()).toThrow('otel and core both write instrumentation.ts')
  })

  it('rewrites @/ imports to the chosen alias when printing', () => {
    const project = openProject({ alias: '~/*' })
    project.write('@/lib/auth.ts', 'import { db } from "@/db";\n', 'better-auth')
    project.module('@/app/layout.tsx').addImport({ from: '@/lib/auth', names: ['auth'] })

    const files = project.print()
    expect(files.get('lib/auth.ts')).toBe('import { db } from "~/db";\n')
    expect(files.get('app/layout.tsx')).toContain('import { auth } from "~/lib/auth";')
  })

  it('answers where a project path lies on disk', () => {
    expect(openProject({ isSrcDirectory: true }).diskPath('@/db/schema')).toBe('src/db/schema')
  })

  it('refuses a base file that does not parse once it is opened', () => {
    const project = createProject({
      files: new Map([['@/lib/broken.ts', 'const = 1']]),
      settings: { alias: '@/*', isSrcDirectory: false },
    })

    expect(() => project.module('@/lib/broken.ts')).toThrow(CodeEditError)
  })
})
