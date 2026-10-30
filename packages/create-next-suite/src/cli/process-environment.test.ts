import { execFileSync } from 'node:child_process'

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
})
