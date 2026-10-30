import { describe, expect, it } from 'vitest'

import type { ParsedPluginManifest } from '../contract/plugin-manifest.ts'
import { parseTestManifest } from '../test-support/test-manifest.ts'
import { detectPackageManager, findUsablePackageManager } from './detect-package-manager.ts'

const packageManager = (name: string): ParsedPluginManifest =>
  parseTestManifest(name, {
    category: 'package-manager',
    packageManager: {
      version: '1.0.0',
      ciInstallArgs: ['ci'],
      whenVersionDiffers: 'warn',
      allowedBuildsIn: 'package.json#allowScripts',
    },
  })

const PLUGINS = [packageManager('pnpm'), packageManager('npm'), packageManager('yarn')]
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
