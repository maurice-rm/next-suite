import { describe, expect, it } from 'vitest'

import { packageManagerFields } from './package-manager-fields.ts'

const CATALOG = { pnpm: '12.16.1' }

const fieldsFor = (allowedBuildsIn: string) =>
  packageManagerFields({
    name: 'pnpm',
    packageManager: {
      version: 'catalog:pnpm',
      installArgs: ['install'],
      whenVersionDiffers: 'download',
      allowedBuildsIn,
    },
    builds: { allowed: ['esbuild', 'sharp'], denied: ['unrs-resolver'] },
    catalog: CATALOG,
  })

describe('packageManagerFields', () => {
  it('pins the exact version and allows the same major in devEngines', () => {
    expect(fieldsFor('pnpm-workspace.yaml')).toEqual({
      packageManager: 'pnpm@12.16.1',
      fields: {
        devEngines: {
          packageManager: { name: 'pnpm', version: '^12.16.1', onFail: 'download' },
        },
      },
    })
  })

  it('writes the allowed builds into the package.json field the manager reads', () => {
    expect(fieldsFor('package.json#allowScripts').fields).toMatchObject({
      allowScripts: { esbuild: true, sharp: true, 'unrs-resolver': false },
    })
    expect(fieldsFor('package.json#dependenciesMeta').fields).toMatchObject({
      dependenciesMeta: {
        esbuild: { built: true },
        sharp: { built: true },
        'unrs-resolver': { built: false },
      },
    })
  })

  it('takes an exact version as it is', () => {
    const fields = packageManagerFields({
      name: 'npm',
      packageManager: {
        version: '12.2.1',
        installArgs: ['install'],
        whenVersionDiffers: 'warn',
        allowedBuildsIn: 'package.json#allowScripts',
      },
      builds: { allowed: [], denied: [] },
      catalog: {},
    })

    expect(fields.packageManager).toBe('npm@12.2.1')
    expect(fields.fields).toMatchObject({ allowScripts: {} })
  })
})
