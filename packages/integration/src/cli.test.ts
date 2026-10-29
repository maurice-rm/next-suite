import manifest from 'create-next-suite/package.json' with { type: 'json' }
import { describe, expect, it } from 'vitest'

import { runCli } from './run-cli.ts'

describe.each(['create-next-suite', 'next-suite'] as const)('the built %s bin', (bin) => {
  it('prints the published version', async () => {
    const result = await runCli(bin, ['--version'])

    expect(result).toEqual({ stdout: `${manifest.version}\n`, stderr: '', exitCode: 0 })
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
