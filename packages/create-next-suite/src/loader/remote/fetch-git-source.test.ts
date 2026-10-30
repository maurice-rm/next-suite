import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

/** An ssh stand-in that records its directory and arguments and fails like an unreachable host. */
const writeFakeSsh = async (): Promise<{ command: string; recorded: () => Promise<string> }> => {
  const recorded = join(root, 'ssh-arguments')
  const command = join(root, 'fake-ssh')
  await writeFile(command, `#!/bin/sh\necho "$PWD $@" > "${recorded}"\nexit 1\n`)
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

  it('runs git in a directory of the cache, so Windows never finds a program in the current one', async () => {
    const ssh = await writeFakeSsh()
    vi.stubEnv('GIT_SSH', undefined)
    vi.stubEnv('GIT_SSH_COMMAND', ssh.command)

    await expect(fetchGitSource(stubRemote(root), SSH_ADDRESS)).rejects.toThrow(PluginLoadError)
    expect((await ssh.recorded()).startsWith(join(root, 'cache', '.clone-'))).toBe(true)
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

  it.each([
    ['a branch', (_commit: string) => 'main'],
    ['a commit', (commit: string) => commit],
  ])('clones %s without running a filter or hook of the git configuration', async (_, refOf) => {
    const marker = (name: string) => join(root, `${name}-ran`)
    const repository = join(root, 'repo')
    await mkdir(repository)
    await writeFile(
      join(repository, '.gitattributes'),
      '*.txt filter=custom\n*.bin filter=lfs\n*.md filter=included\n',
    )
    await writeFile(join(repository, 'read.md'), 'read\n')
    await writeFile(join(repository, 'note.txt'), 'note\n')
    await writeFile(join(repository, 'data.bin'), 'data\n')
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim()
    git('init', '--quiet', '--initial-branch', 'main')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'init')
    const hooks = join(root, 'hooks')
    await mkdir(hooks)
    await writeFile(join(hooks, 'post-checkout'), `#!/bin/sh\ntouch "${marker('hook')}"\n`)
    await chmod(join(hooks, 'post-checkout'), 0o755)
    const globalConfig = join(root, 'gitconfig')
    await writeFile(
      globalConfig,
      [
        '[core]',
        `\thooksPath = ${hooks}`,
        '[filter "custom"]',
        `\tsmudge = touch "${marker('custom')}" && cat`,
        '\trequired = true',
        `[includeIf "gitdir:${root}/"]`,
        `\tpath = ${join(root, 'included-gitconfig')}`,
        '[filter "lfs"]',
        `\tprocess = touch "${marker('lfs')}"`,
        `\tsmudge = touch "${marker('lfs')}" && cat`,
        '\trequired = true',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(root, 'included-gitconfig'),
      `[filter "included"]\n\tsmudge = touch "${marker('included')}" && cat\n\trequired = true\n`,
    )
    vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig)

    const fetched = await fetchGitSource(stubRemote(root), {
      kind: 'git',
      url: `file://${repository}`,
      ref: refOf(git('rev-parse', 'HEAD')),
    })

    expect(await readFile(join(fetched.directory, 'note.txt'), 'utf8')).toBe('note\n')
    expect(
      ['hook', 'custom', 'lfs', 'included'].filter((name) => existsSync(marker(name))),
    ).toEqual([])
  })

  it('reads no git configuration of a repository around the cache', async () => {
    const planted = join(root, 'planted-ssh-ran')
    execFileSync('git', ['init', '--quiet', root])
    execFileSync('git', ['-C', root, 'config', 'core.sshCommand', `touch "${planted}"; false`])
    vi.stubEnv('GIT_SSH', undefined)
    vi.stubEnv('GIT_SSH_COMMAND', undefined)
    vi.stubEnv('GIT_CONFIG_GLOBAL', join(root, 'no-gitconfig'))

    await expect(fetchGitSource(stubRemote(root), SSH_ADDRESS)).rejects.toThrow(PluginLoadError)
    expect(existsSync(planted)).toBe(false)
  })
})
