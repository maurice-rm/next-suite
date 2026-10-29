import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { runCommand, toShellCommand } from './run-command.ts'

describe('runCommand', () => {
  it('captures the output of stdout and stderr', async () => {
    const result = await runCommand(
      process.execPath,
      ['-e', "process.stdout.write('out '); process.stderr.write('err')"],
      tmpdir(),
    )

    expect(result).toEqual({ isSuccess: true, output: 'out err' })
  })

  it('fails on a non-zero exit code', async () => {
    const result = await runCommand(process.execPath, ['-e', 'process.exit(3)'], tmpdir())

    expect(result.isSuccess).toBe(false)
  })

  it('fails when the command does not exist', async () => {
    const result = await runCommand('next-suite-no-such-command', [], tmpdir())

    expect(result).toMatchObject({ isSuccess: false, output: expect.stringContaining('ENOENT') })
  })

  it('quotes arguments with spaces for the Windows shell', () => {
    expect(toShellCommand('git', ['commit', '--message', 'Initial commit'])).toBe(
      'git commit --message "Initial commit"',
    )
  })
})
