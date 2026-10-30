import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { processRemoteEnvironment } from './process-environment.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => 'gh-token\n') }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(execFileSync).mockClear()
})

describe('processRemoteEnvironment', () => {
  it('asks the GitHub CLI for a token once, however many plugins need one', () => {
    vi.stubEnv('GH_TOKEN', '')
    vi.stubEnv('GITHUB_TOKEN', '')
    const remote = processRemoteEnvironment()

    expect(remote.tokenFor('github')).toBe('gh-token')
    expect(remote.tokenFor('github')).toBe('gh-token')
    expect(execFileSync).toHaveBeenCalledTimes(1)
  })

  it('prefers a token from the environment', () => {
    vi.stubEnv('GH_TOKEN', 'env-token')

    expect(processRemoteEnvironment().tokenFor('github')).toBe('env-token')
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('asks the GitHub CLI from the cache directory, so Windows never runs a gh of the current one', async () => {
    const cacheHome = await mkdtemp(join(tmpdir(), 'next-suite-cache-'))
    vi.stubEnv('GH_TOKEN', '')
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.stubEnv('XDG_CACHE_HOME', cacheHome)
    const remote = processRemoteEnvironment()

    remote.tokenFor('github')

    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      ['auth', 'token'],
      expect.objectContaining({ cwd: remote.cacheDir }),
    )
    await rm(cacheHome, { recursive: true, force: true })
  })
})
