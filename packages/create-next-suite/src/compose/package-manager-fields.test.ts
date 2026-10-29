import { describe, expect, it } from 'vitest'

import { packageManagerFields } from './package-manager-fields.ts'

const CATALOG = { pnpm: '12.16.1' }

const fieldsFor = (allowedBuilds: 'config-file' | 'allow-scripts' | 'dependencies-meta') =>
  packageManagerFields({
    name: 'pnpm',
    packageManager: { version: 'catalog:pnpm', onFail: 'download', allowedBuilds },
    allowedBuilds: ['esbuild', 'sharp'],
    catalog: CATALOG,
  })

describe('packageManagerFields', () => {
  it('pins the exact version and allows the same major in devEngines', () => {
    expect(fieldsFor('config-file')).toEqual({
      packageManager: 'pnpm@12.16.1',
      fields: {
        devEngines: {
          packageManager: { name: 'pnpm', version: '^12.16.1', onFail: 'download' },
        },
      },
    })
  })

  it('writes the allowed builds into the package.json field the manager reads', () => {
    expect(fieldsFor('allow-scripts').fields).toMatchObject({
      allowScripts: { esbuild: true, sharp: true },
    })
    expect(fieldsFor('dependencies-meta').fields).toMatchObject({
      dependenciesMeta: { esbuild: { built: true }, sharp: { built: true } },
    })
  })

  it('takes an exact version as it is', () => {
    const fields = packageManagerFields({
      name: 'npm',
      packageManager: { version: '12.2.1', onFail: 'warn', allowedBuilds: 'allow-scripts' },
      allowedBuilds: [],
      catalog: {},
    })

    expect(fields.packageManager).toBe('npm@12.2.1')
    expect(fields.fields).toMatchObject({ allowScripts: {} })
  })
})
