import { describe, expect, it } from 'vitest'

import type { Category } from '../contract/category.ts'
import { type ParsedPluginManifest, pluginManifestSchema } from '../contract/plugin-manifest.ts'
import {
  detectPackageManager,
  findUnsupportedVersion,
  findUsablePackageManager,
  preferPackageManager,
} from './detect-package-manager.ts'

const packageManager = (name: string): ParsedPluginManifest =>
  pluginManifestSchema.parse({
    name,
    version: '1.0.0',
    engine: '^1.0.0',
    title: name,
    description: name,
    category: 'package-manager',
    packageManager: { version: '1.0.0', onFail: 'warn', allowedBuilds: 'allow-scripts' },
  })

const PLUGINS = [packageManager('pnpm'), packageManager('npm'), packageManager('yarn')]
const CATEGORIES: Category[] = [
  {
    id: 'package-manager',
    question: 'Which package manager?',
    section: 'Project',
    cardinality: 'one',
    default: 'pnpm',
  },
  { id: 'orm', question: 'Which ORM?', section: 'Data', cardinality: 'at-most-one', default: null },
]

const defaultOf = (categories: Category[]) => categories[0]?.default

describe('detectPackageManager', () => {
  it('reads the name and version from the user agent', () => {
    expect(detectPackageManager('npm/12.2.1 node/v24.15.0 linux x64 workspaces/false')).toEqual({
      name: 'npm',
      version: '12.2.1',
    })
    expect(detectPackageManager('yarn/4.18.1 npm/? node/v24.12.0 linux x64')).toEqual({
      name: 'yarn',
      version: '4.18.1',
    })
  })

  it('answers nothing without a user agent it understands', () => {
    expect(detectPackageManager(undefined)).toBeUndefined()
    expect(detectPackageManager('')).toBeUndefined()
    expect(detectPackageManager('Mozilla/5.0')).toBeUndefined()
  })
})

describe('findUnsupportedVersion', () => {
  it('rejects Yarn 1 with the way to Yarn 4', () => {
    expect(findUnsupportedVersion({ name: 'yarn', version: '1.22.22' })).toMatch(/Corepack/)
    expect(findUnsupportedVersion({ name: 'yarn', version: '4.18.1' })).toBeUndefined()
    expect(findUnsupportedVersion({ name: 'pnpm', version: '1.0.0' })).toBeUndefined()
  })
})

describe('findUsablePackageManager', () => {
  it('answers the invoking package manager when a plugin exists and its version works', () => {
    expect(findUsablePackageManager(PLUGINS, { name: 'npm', version: '12.2.1' })).toBe('npm')
  })

  it('answers nothing for a manager without plugin, an unsupported version or none', () => {
    for (const invoking of [
      { name: 'bun', version: '1.4.4' },
      { name: 'yarn', version: '1.22.22' },
      undefined,
    ]) {
      expect(findUsablePackageManager(PLUGINS, invoking)).toBeUndefined()
    }
  })
})

describe('preferPackageManager', () => {
  it('makes the package manager the default of its question only', () => {
    const categories = preferPackageManager(CATEGORIES, 'npm')

    expect(defaultOf(categories)).toBe('npm')
    expect(categories[1]).toEqual(CATEGORIES[1])
  })

  it('keeps the default without a package manager', () => {
    expect(defaultOf(preferPackageManager(CATEGORIES, undefined))).toBe('pnpm')
  })
})
