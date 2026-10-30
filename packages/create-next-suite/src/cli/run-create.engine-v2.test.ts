import { describe, expect, it } from 'vitest'

import { setUpCreateRuns } from '../test-support/run-create-harness.ts'

const { run, pathOf, write } = setUpCreateRuns()

/** Every category but the package manager left empty: the base project and a package manager. */
const BARE_ANSWERS = {
  styling: [],
  linter: null,
  formatter: null,
  'unused-code': null,
  'git-hooks': null,
  'unit-tests': null,
  'env-validation': null,
  logging: null,
  'security-headers': null,
  seo: null,
  ci: null,
  agents: null,
}
const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun']

const dryRun = async (engine: string, flags: string[]) => {
  await write({ 'bare.json': JSON.stringify(BARE_ANSWERS) })
  return run(
    ['my-app', '--yes', '--dry-run', '--diff', '--answers', pathOf('bare.json'), ...flags],
    {
      engine,
    },
  )
}

describe('runCreate with NEXT_SUITE_ENGINE=v2', () => {
  it.each(PACKAGE_MANAGERS)(
    'plans the bare project with %s as the manifest engine does',
    async (packageManager) => {
      const flags = ['--package-manager', packageManager]

      const v2 = await dryRun('v2', flags)

      expect(v2.error).toBe('')
      expect(v2).toEqual(await dryRun('v1', flags))
    },
  )

  it.each([
    [['--src-dir', '--import-alias', '~/*']],
    [['--react-compiler', '--no-cache-components']],
    [['--agents', 'agents-md', '--no-cache-components']],
  ])('applies the base settings %j as the manifest engine does', async (settings) => {
    const flags = ['--package-manager', 'pnpm', ...settings]
    const v1 = await dryRun('v1', flags)

    if (settings.includes('agents-md')) {
      expect((await dryRun('v2', flags)).error).toContain('agents-md has no plugin.ts form yet')
      return
    }
    expect(await dryRun('v2', flags)).toEqual(v1)
  })

  it('refuses a plugin that has no plugin.ts form yet', async () => {
    const result = await run(['my-app', '--yes', '--dry-run'], { engine: 'v2' })

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain(
      'has no plugin.ts form yet, so it does not run with NEXT_SUITE_ENGINE=v2; unset NEXT_SUITE_ENGINE to use it',
    )
  })

  it('refuses an unknown engine and plugins from addresses', async () => {
    const unknown = await run(['my-app', '--yes', '--dry-run'], { engine: 'v3' })
    const external = await run(['my-app', '--yes', '--dry-run', '--plugin', './mail'], {
      engine: 'v2',
    })

    expect(unknown.error).toContain('NEXT_SUITE_ENGINE is "v3"; use v1 or v2')
    expect(external.error).toContain('--plugin loads no plugins while NEXT_SUITE_ENGINE is v2')
  })

  it('writes the project and installs it with the arguments of its package manager', async () => {
    await write({ 'bare.json': JSON.stringify(BARE_ANSWERS) })

    const result = await run(
      ['my-app', '--yes', '--answers', pathOf('bare.json'), '--package-manager', 'yarn'],
      { engine: 'v2' },
    )

    expect(result.error).toBe('')
    expect(result.commands).toContain('yarn install --no-immutable')
    expect(result.output).toContain('my-app is ready')
  })
})
