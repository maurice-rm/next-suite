import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubRemote } from '../../test-support/stub-remote.ts'
import { PluginLoadError } from '../plugin-load-error.ts'
import { fetchGitSource } from './fetch-git-source.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-git-'))
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

const SSH_ADDRESS = {
  kind: 'git',
  url: 'ssh://git@example.invalid/acme/plugins.git',
  ref: undefined,
} as const

/** An ssh stand-in that records its arguments and fails like an unreachable host. */
const writeFakeSsh = async (): Promise<{ command: string; recorded: () => Promise<string> }> => {
  const recorded = join(root, 'ssh-arguments')
  const command = join(root, 'fake-ssh')
  await writeFile(command, `#!/bin/sh\necho "$@" > "${recorded}"\nexit 1\n`)
  await chmod(command, 0o755)
  return { command, recorded: () => readFile(recorded, 'utf8') }
}

describe('fetchGitSource', () => {
  it('runs the ssh command in batch mode, so a clone never stops to ask for a password', async () => {
    const ssh = await writeFakeSsh()
    vi.stubEnv('GIT_SSH', undefined)
    vi.stubEnv('GIT_SSH_COMMAND', ssh.command)

    await expect(fetchGitSource(stubRemote(root), SSH_ADDRESS)).rejects.toThrow(PluginLoadError)
    expect(await ssh.recorded()).toContain('-o BatchMode=yes')
  })

  it('keeps the ssh command of the git configuration, in batch mode', async () => {
    const ssh = await writeFakeSsh()
    const globalConfig = join(root, 'gitconfig')
    await writeFile(globalConfig, `[core]\n\tsshCommand = ${ssh.command}\n`)
    vi.stubEnv('GIT_SSH', undefined)
    vi.stubEnv('GIT_SSH_COMMAND', undefined)
    vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)

    await expect(fetchGitSource(stubRemote(root), SSH_ADDRESS)).rejects.toThrow(PluginLoadError)
    expect(await ssh.recorded()).toContain('-o BatchMode=yes')
  })
})
