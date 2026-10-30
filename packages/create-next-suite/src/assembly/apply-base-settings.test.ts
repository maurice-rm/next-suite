import { describe, expect, it } from 'vitest'

import { createProject } from '../project-model/project.ts'
import { applyBaseSettings, type BaseSettings } from './apply-base-settings.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const BASE_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify({ name: 'next-suite-app', devDependencies: {} }, null, 2)}\n`,
  'tsconfig.json': `${JSON.stringify(
    { compilerOptions: { paths: { '@/*': ['./*'] } }, include: ['**/*.ts'] },
    null,
    2,
  )}\n`,
  'README.md': source('# next-suite-app', '', 'A Next.js app.'),
  'next.config.ts': source(
    'import type { NextConfig } from "next";',
    '',
    'const nextConfig: NextConfig = {',
    '};',
    '',
    'export default nextConfig;',
  ),
  '@/app/layout.tsx': source(
    'import type { Metadata } from "next";',
    '',
    'export const metadata: Metadata = {',
    '  title: {',
    '    default: "next-suite-app",',
    '    template: "%s | next-suite-app",',
    '  },',
    '};',
    '',
    'export default function RootLayout({ children }: LayoutProps<"/">) {',
    '  return (',
    '    <html lang="en">',
    '      <body>{children}</body>',
    '    </html>',
    '  );',
    '}',
  ),
  '@/app/page.tsx': source(
    'export default function Home() {',
    '  return <h1>next-suite-app</h1>;',
    '}',
  ),
}

const DEFAULTS: BaseSettings = {
  projectName: 'my-app',
  importAlias: '@/*',
  isSrcDirectory: false,
  usesReactCompiler: false,
  usesCacheComponents: false,
}

const applied = (settings: Partial<BaseSettings>, categories: string[] = []) => {
  const all = { ...DEFAULTS, ...settings }
  const project = createProject({
    files: new Map(Object.entries(BASE_FILES)),
    settings: { alias: all.importAlias, isSrcDirectory: all.isSrcDirectory },
  })
  applyBaseSettings(project, all, new Set(categories))
  return project.print()
}

const fileOf = (files: ReadonlyMap<string, string>, path: string): string =>
  files.get(path) ?? `no ${path}`

describe('applyBaseSettings', () => {
  it('replaces the base’s project name in package.json, the metadata, README and start page', () => {
    const files = applied({})

    expect(JSON.parse(fileOf(files, 'package.json')).name).toBe('my-app')
    expect(fileOf(files, 'app/layout.tsx')).toContain(
      source('  title: {', '    default: "my-app",', '    template: "%s | my-app",', '  },'),
    )
    expect(fileOf(files, 'README.md')).toBe(source('# my-app', '', 'A Next.js app.'))
    expect(fileOf(files, 'app/page.tsx')).toContain('<h1>my-app</h1>')
  })

  it('turns agent rules off unless a plugin of the agents category runs', () => {
    expect(fileOf(applied({}), 'next.config.ts')).toContain('agentRules: false')
    expect(fileOf(applied({}, ['agents']), 'next.config.ts')).toContain(
      'const nextConfig: NextConfig = {\n};',
    )
  })

  it('adds the React Compiler and Cache Components after the agent rules', () => {
    const files = applied({ usesReactCompiler: true, usesCacheComponents: true })

    expect(fileOf(files, 'next.config.ts')).toContain(
      source(
        'const nextConfig: NextConfig = {',
        '  agentRules: false,',
        '  reactCompiler: true,',
        '  cacheComponents: true,',
        '  partialPrefetching: true,',
        '};',
      ),
    )
    expect(JSON.parse(fileOf(files, 'package.json')).devDependencies).toEqual({
      'babel-plugin-react-compiler': '1.0.0',
    })
  })

  it('points the import alias at the source directory', () => {
    const files = applied({ importAlias: '~/*', isSrcDirectory: true })

    expect(JSON.parse(fileOf(files, 'tsconfig.json')).compilerOptions.paths).toEqual({
      '~/*': ['./src/*'],
    })
    expect([...files.keys()]).toContain('src/app/page.tsx')
  })

  it('leaves tsconfig.json byte for byte with the default alias', () => {
    expect(fileOf(applied({}), 'tsconfig.json')).toBe(BASE_FILES['tsconfig.json'])
  })
})
