import { describe, expect, it } from 'vitest'

import { KEYS } from '../test-support/keys.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'

const { run, write } = setUpCreateRuns()

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
    expect(result.output).not.toContain('The pnpm plugin.')
    expect(result.output).not.toContain('The npm plugin.')
  })

  it('asks no base settings in the wizard, only git and install after the plugins', async () => {
    const result = await run(['my-app', '--dry-run', '--no-better-auth', '--no-orm'], {
      isInteractive: true,
      keys: [KEYS.enter, 'n', 'y', 'y'],
    })

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('src/ directory')
    expect(result.output.indexOf('Initialize a git repository?')).toBeLessThan(
      result.output.indexOf('Install dependencies?'),
    )
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
