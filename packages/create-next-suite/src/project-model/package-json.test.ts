import { describe, expect, it } from 'vitest'

import { openPackageJson } from './package-json.ts'
import { ProjectError } from './project-error.ts'

const BASE = `${JSON.stringify(
  {
    name: 'next-suite-app',
    private: true,
    scripts: { dev: 'next dev' },
    dependencies: { next: '16.1.0', react: '19.2.0' },
  },
  null,
  2,
)}\n`

describe('openPackageJson', () => {
  it('prints an unchanged file in its field order', () => {
    const packageJson = openPackageJson(BASE)

    expect(JSON.parse(packageJson.print())).toEqual(JSON.parse(BASE))
    expect(Object.keys(JSON.parse(packageJson.print()))).toEqual([
      'name',
      'private',
      'scripts',
      'dependencies',
    ])
  })

  it('adds dependencies sorted by name and creates devDependencies when missing', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.addDependency('better-auth', '1.7.14', 'better-auth')
    packageJson.addDevDependency('vitest', '5.0.5', 'vitest')

    const printed = JSON.parse(packageJson.print())
    expect(Object.keys(printed.dependencies)).toEqual(['better-auth', 'next', 'react'])
    expect(printed.devDependencies).toEqual({ vitest: '5.0.5' })
  })

  it('takes a dependency added again with the same version once', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.addDependency('next', '16.1.0', 'sentry')

    expect(JSON.parse(packageJson.print()).dependencies.next).toBe('16.1.0')
  })

  it('names both origins when a dependency gets a second version', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.addDependency('zod', '4.0.0', 't3-env')

    expect(() => packageJson.addDependency('zod', '3.0.0', 'forms')).toThrow(ProjectError)
    expect(() => packageJson.addDependency('zod', '3.0.0', 'forms')).toThrow(
      't3-env and forms set the dependency zod to different versions (4.0.0, 3.0.0)',
    )
  })

  it('treats the versions in the base file as the base’s', () => {
    expect(() => openPackageJson(BASE).addDependency('next', '15.0.0', 'old')).toThrow(
      'base and old set the dependency next to different versions (16.1.0, 15.0.0)',
    )
  })

  it('adds scripts in order and refuses a script set twice differently', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.setScript('test', 'vitest', 'vitest')
    packageJson.setScript('test', 'vitest', 'vitest')

    expect(packageJson.scripts()).toEqual({ dev: 'next dev', test: 'vitest' })
    expect(() => packageJson.setScript('test', 'jest', 'jest')).toThrow(
      'vitest and jest set the script test to different commands (vitest, jest)',
    )
  })

  it('sets other fields, and refuses one set twice differently', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.setField('type', 'module', 'base-settings')
    packageJson.setField('engines', { node: '>=24' }, 'pnpm')
    packageJson.setField('engines', { node: '>=24' }, 'pnpm')

    expect(JSON.parse(packageJson.print())).toMatchObject({
      type: 'module',
      engines: { node: '>=24' },
    })
    expect(() => packageJson.setField('type', 'commonjs', 'cjs')).toThrow(
      'base-settings and cjs set the field type to different values',
    )
  })

  it('answers the version of a dependency or devDependency', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.addDevDependency('typescript', '7.0.2', 'base')

    expect(packageJson.versionOf('next')).toBe('16.1.0')
    expect(packageJson.versionOf('typescript')).toBe('7.0.2')
    expect(() => packageJson.versionOf('pino')).toThrow('package.json has no dependency pino')
  })

  it('prints like JSON.stringify, one array element per line', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.setField('trustedDependencies', ['esbuild', 'sharp'], 'bun')

    expect(packageJson.print()).toBe(
      `${JSON.stringify({ ...JSON.parse(BASE), trustedDependencies: ['esbuild', 'sharp'] }, null, 2)}\n`,
    )
  })

  it('renames the project in its place', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.setName('my-app')

    const printed = JSON.parse(packageJson.print())
    expect(printed.name).toBe('my-app')
    expect(Object.keys(printed)[0]).toBe('name')
  })

  it('records the package manager before the scripts and its devEngines entry after the rest', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.usePackageManager({
      name: 'pnpm',
      version: '12.16.1',
      whenVersionDiffers: 'download',
    })

    const printed = JSON.parse(packageJson.print())
    expect(Object.keys(printed)).toEqual([
      'name',
      'private',
      'packageManager',
      'scripts',
      'dependencies',
      'devEngines',
    ])
    expect(printed.packageManager).toBe('pnpm@12.16.1')
    expect(printed.devEngines).toEqual({
      packageManager: { name: 'pnpm', version: '^12.16.1', onFail: 'download' },
    })
  })

  it('refuses a second package manager', () => {
    const packageJson = openPackageJson(BASE)
    packageJson.usePackageManager({
      name: 'pnpm',
      version: '12.16.1',
      whenVersionDiffers: 'download',
    })

    expect(() =>
      packageJson.usePackageManager({ name: 'npm', version: '12.2.1', whenVersionDiffers: 'warn' }),
    ).toThrow('pnpm and npm set the field packageManager to different values')
  })

  it('refuses a file that is no JSON object', () => {
    expect(() => openPackageJson('[]')).toThrow('package.json holds no JSON object')
    expect(() => openPackageJson('{')).toThrow('package.json is no valid JSON')
  })
})
