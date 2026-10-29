import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { composeProject } from '../compose/compose-project.ts'
import { categoriesSchema } from '../contract/category.ts'
import { type LoadedPlugin, loadPlugin } from '../loader/load-plugin.ts'
import { loadAssets } from './load-assets.ts'

const PACKAGE_ROOT = join(import.meta.dirname, '../..')

let root: string
let base: LoadedPlugin
let images: LoadedPlugin
let builtIn: LoadedPlugin[]
let catalog: Record<string, string>

const writeTestPlugin = async (name: string, manifest: object, files: Record<string, string>) => {
  const folder = join(root, name)
  await mkdir(join(folder, 'files'), { recursive: true })
  await writeFile(
    join(folder, 'plugin.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      contract: '^1.0.0',
      title: name,
      description: name,
      ...manifest,
    }),
  )
  for (const [path, content] of Object.entries(files)) {
    await writeFile(join(folder, path), content)
  }
  return loadPlugin(folder)
}

const compose = (packageManager: string, allowsSharp: boolean) => {
  const selected = [
    ...builtIn.filter((plugin) => plugin.manifest.name === packageManager),
    ...(allowsSharp ? [images] : []),
  ]
  return composeProject({
    projectName: 'my-app',
    base,
    available: builtIn,
    selected,
    answers: {
      plugins: selected.map(({ manifest }) => ({
        name: manifest.name,
        category: manifest.category,
      })),
      settings: {},
      options: {},
    },
    recordedAnswers: {},
    catalog,
    cliVersion: '2.0.0',
    createdAt: new Date('2026-11-01T10:00:00Z'),
  })
}

const fileOf = async (packageManager: string, path: string, allowsSharp = false) =>
  (await compose(packageManager, allowsSharp)).files.find((file) => file.path === path)?.content

const packageJsonOf = async (packageManager: string, allowsSharp = false) =>
  JSON.parse((await fileOf(packageManager, 'package.json', allowsSharp)) ?? '{}')

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-package-managers-'))
  base = await writeTestPlugin(
    'base',
    { files: [{ source: 'files/gitignore.hbs', target: '.gitignore' }] },
    { 'files/gitignore.hbs': 'node_modules\n{{#each gitignore}}{{this}}\n{{/each}}' },
  )
  images = await writeTestPlugin('images', { contributes: { allowedBuilds: ['sharp'] } }, {})
  builtIn = (await loadAssets(PACKAGE_ROOT)).plugins
  catalog = JSON.parse(await readFile(join(PACKAGE_ROOT, 'catalog.json'), 'utf8'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('the built-in package managers', () => {
  it('fill the package-manager category, with pnpm as its default', async () => {
    const categories = categoriesSchema.parse(
      JSON.parse(await readFile(join(PACKAGE_ROOT, 'categories.json'), 'utf8')),
    )

    expect(categories).toContainEqual(
      expect.objectContaining({ id: 'package-manager', cardinality: 'one', default: 'pnpm' }),
    )
    expect(builtIn.map((plugin) => plugin.manifest.name).sort()).toEqual([
      'bun',
      'npm',
      'pnpm',
      'yarn',
    ])
  })

  it('pin their version in packageManager and devEngines', async () => {
    expect(await packageJsonOf('pnpm')).toMatchObject({
      packageManager: 'pnpm@12.16.1',
      devEngines: { packageManager: { name: 'pnpm', version: '^12.16.1', onFail: 'download' } },
    })
    for (const [name, version] of [
      ['npm', '12.2.1'],
      ['yarn', '4.18.1'],
      ['bun', '1.4.4'],
    ]) {
      expect(await packageJsonOf(name ?? '')).toMatchObject({
        packageManager: `${name}@${version}`,
        devEngines: { packageManager: { name, version: `^${version}`, onFail: 'warn' } },
      })
    }
  })

  it('pnpm holds releases back a day and lists the allowed builds in pnpm-workspace.yaml', async () => {
    expect(await fileOf('pnpm', 'pnpm-workspace.yaml')).toBe(
      'minimumReleaseAge: 1440\nallowBuilds:\n',
    )
    expect(await fileOf('pnpm', 'pnpm-workspace.yaml', true)).toBe(
      'minimumReleaseAge: 1440\nallowBuilds:\n  "sharp": true\n',
    )
  })

  it('npm holds releases back a day and fails on builds missing from allowScripts', async () => {
    expect(await fileOf('npm', '.npmrc')).toBe('min-release-age=1\nstrict-allow-scripts=true\n')
    expect(await packageJsonOf('npm')).toMatchObject({ allowScripts: {} })
    expect(await packageJsonOf('npm', true)).toMatchObject({ allowScripts: { sharp: true } })
  })

  it('Yarn installs into node_modules, holds releases back a day and ignores its state', async () => {
    expect(await fileOf('yarn', '.yarnrc.yml')).toBe(
      'nodeLinker: node-modules\nnpmMinimalAgeGate: 1d\n',
    )
    expect(await packageJsonOf('yarn', true)).toMatchObject({
      dependenciesMeta: { sharp: { built: true } },
    })
    expect(await fileOf('yarn', '.gitignore')).toBe(
      [
        'node_modules',
        '.yarn/*',
        '!.yarn/patches',
        '!.yarn/plugins',
        '!.yarn/releases',
        '!.yarn/sdks',
        '!.yarn/versions',
        '',
      ].join('\n'),
    )
  })

  it('Bun holds releases back a day and replaces its built-in trust list', async () => {
    expect(await fileOf('bun', 'bunfig.toml')).toBe('[install]\nminimumReleaseAge = 86400\n')
    expect(await packageJsonOf('bun')).toMatchObject({ trustedDependencies: [] })
    expect(await packageJsonOf('bun', true)).toMatchObject({ trustedDependencies: ['sharp'] })
  })
})
