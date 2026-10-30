import packageJson from 'create-next-suite/package.json' with { type: 'json' }
import { describe, expect, it } from 'vitest'

import { runCli } from './run-cli.ts'

describe.each(['create-next-suite', 'next-suite'] as const)('the built %s bin', (bin) => {
  it('prints the published version', async () => {
    const result = await runCli(bin, ['--version'])

    expect(result).toEqual({ stdout: `${packageJson.version}\n`, stderr: '', exitCode: 0 })
  })

  it('prints its usage for --help', async () => {
    const result = await runCli(bin, ['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`Usage: ${bin}`)
  })

  it('fails on an unknown option', async () => {
    const result = await runCli(bin, ['--unknown'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unknown option '--unknown'")
  })
})

describe('the built create-next-suite bin', () => {
  it('lists the flags of the built-in plugins in --help, grouped by wizard section', async () => {
    const result = await runCli('create-next-suite', ['--help'])

    expect(result.stdout).toMatch(/\nProject:\n {2}--package-manager <plugin> /)
    expect(result.stdout).toMatch(/\nTooling:\n {2}--linter <plugin> /)
    expect(result.stdout).toMatch(/\nSetup:\n {2}--git /)
    expect(result.stdout).toContain('turn off --linter')
  })
})
