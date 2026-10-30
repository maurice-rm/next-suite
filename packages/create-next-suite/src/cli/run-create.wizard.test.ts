import { describe, expect, it } from 'vitest'

import { KEYS } from '../test-support/keys.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'

const { run, pathOf, write } = setUpCreateRuns()

/** Every category but the package manager left empty. */
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

describe('runCreate in the wizard', () => {
  it('asks in the wizard what to do with a directory that has files', async () => {
    await write({ 'shop/notes.txt': 'mine' })

    const result = await run(['shop', '--dry-run'], { isInteractive: true, keys: [KEYS.ctrlC] })

    expect(result.output).toContain(
      '"shop" exists and is not empty. How would you like to proceed?',
    )
    expect(result.output).toContain('Empty the directory — delete everything except .git')
    expect(result.output).toContain('Continue (keep existing files)')
  })

  it('closes the wizard frame with the error of a failed guided run', async () => {
    const result = await run(['My App', '--dry-run'], { isInteractive: true })

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('└  create-next-suite: "My App" is not a valid package name')
  })

  it('opens the wizard with the intro and the Project section, and ends a cancelled run cleanly', async () => {
    const result = await run(['--dry-run'], { isInteractive: true, keys: [KEYS.ctrlC] })

    expect(result.exitCode).toBe(130)
    expect(result.output).toContain("┌  Let's lay the foundation")
    expect(result.output).toContain('│   Project ')
    expect(result.output).toContain('└  Operation cancelled.')
  })

  it('marks the detected package manager and shows no package manager descriptions', async () => {
    const result = await run(['my-app', '--dry-run'], {
      isInteractive: true,
      keys: [KEYS.ctrlC],
      userAgent: 'npm/12.2.1 node/v24.15.0 linux x64 workspaces/false',
    })

    expect(result.output).toContain('npm (detected)')
    expect(result.output).not.toContain('Installs with pnpm')
    expect(result.output).not.toContain('Installs with npm')
  })

  it('asks no base settings in the wizard, only git and install after the plugins', async () => {
    await write({ 'bare.json': JSON.stringify(BARE_ANSWERS) })

    const result = await run(['my-app', '--dry-run', '--answers', pathOf('bare.json')], {
      isInteractive: true,
      keys: [KEYS.enter, 'n', 'y', 'y'],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('src/ directory')
    expect(result.output.indexOf('Initialize a git repository?')).toBeLessThan(
      result.output.indexOf('Install dependencies?'),
    )
  })

  it('leaves out lint-staged in the quick start without a linter or a formatter', async () => {
    const result = await run(['my-app', '--dry-run', '--no-linter', '--no-formatter'], {
      isInteractive: true,
      keys: [KEYS.enter, 'y', KEYS.enter],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('└  Dry run, nothing was written')
    expect(result.output).not.toContain('lint-staged')
  })

  it('takes the quick start and frames the dry run in the wizard', async () => {
    const result = await run(['my-app', '--dry-run'], {
      isInteractive: true,
      keys: [KEYS.enter, 'y', KEYS.enter],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Quick start with recommended defaults?')
    expect(result.output).toContain('│  Files:')
    expect(result.output).toContain('└  Dry run, nothing was written')
  })
})
