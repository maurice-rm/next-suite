import { describe, expect, it } from 'vitest'

import type { CommandResult } from './run-command.ts'
import { type PostStepsInput, runPostSteps, type StepReporter } from './run-post-steps.ts'

const SUCCESS: CommandResult = { isSuccess: true, output: '' }
const FAILURE: CommandResult = { isSuccess: false, output: 'boom' }

type Results = Record<string, CommandResult>

/** Runs the post-steps with commands that answer from `results`, and records what happened. */
const run = async (input: Partial<PostStepsInput>, results: Results = {}) => {
  const commands: string[] = []
  const events: string[] = []
  const reporter: StepReporter = {
    step: async (messages, action) => {
      const result = await action()
      events.push(result.isSuccess ? messages.done : messages.failed)
      return result.isSuccess
    },
    note: (message) => events.push(message),
  }
  await runPostSteps({
    directory: '/tmp/my-app',
    packageManager: 'pnpm',
    scripts: [],
    shouldInstall: true,
    shouldInitializeGit: true,
    reporter,
    runCommand: async (command, args) => {
      const line = [command, ...args].join(' ')
      commands.push(line)
      return results[line] ?? SUCCESS
    },
    ...input,
  })
  return { commands, events }
}

const OUTSIDE_REPOSITORY: Results = { 'git rev-parse --is-inside-work-tree': FAILURE }

describe('runPostSteps', () => {
  it('initializes git, installs, runs the scripts and commits, in this order', async () => {
    const { commands } = await run({ scripts: ['format'] }, OUTSIDE_REPOSITORY)

    expect(commands).toEqual([
      'git rev-parse --is-inside-work-tree',
      'git init',
      'pnpm --version',
      'pnpm install',
      'pnpm run format',
      'git add --all',
      'git commit --message Initial commit from create-next-suite',
    ])
  })

  it('skips git inside an existing repository', async () => {
    const { commands, events } = await run({ shouldInstall: false })

    expect(commands).toEqual(['git rev-parse --is-inside-work-tree'])
    expect(events).toEqual(['The directory is inside a git repository already; skipped git init'])
  })

  it('runs nothing the user turned off', async () => {
    const { commands } = await run({ shouldInstall: false, shouldInitializeGit: false })

    expect(commands).toEqual([])
  })

  it('names the command to run when the package manager does not start', async () => {
    const { commands, events } = await run(
      { shouldInitializeGit: false, scripts: ['format'] },
      { 'pnpm --version': FAILURE },
    )

    expect(commands).toEqual(['pnpm --version'])
    expect(events).toEqual(['pnpm did not start; install it, then run `pnpm install`'])
  })

  it('rejects Yarn 1 with the way to Yarn 4', async () => {
    const { commands, events } = await run(
      { packageManager: 'yarn', shouldInitializeGit: false },
      { 'yarn --version': { isSuccess: true, output: '1.22.22\n' } },
    )

    expect(commands).toEqual(['yarn --version'])
    expect(events[0]).toMatch(/^Yarn 1 is not supported; .*then run `yarn install`$/)
  })

  it('skips the scripts after a failed install, but still commits', async () => {
    const { commands, events } = await run(
      { scripts: ['format'] },
      { ...OUTSIDE_REPOSITORY, 'pnpm install': FAILURE },
    )

    expect(commands).not.toContain('pnpm run format')
    expect(commands.at(-1)).toBe('git commit --message Initial commit from create-next-suite')
    expect(events).toContain('Could not install dependencies; run `pnpm install` yourself')
  })

  it('does not commit when git init failed', async () => {
    const { commands } = await run(
      { shouldInstall: false },
      { ...OUTSIDE_REPOSITORY, 'git init': FAILURE },
    )

    expect(commands).toEqual(['git rev-parse --is-inside-work-tree', 'git init'])
  })

  it('reports a failed add as a failed commit', async () => {
    const { commands, events } = await run(
      { shouldInstall: false },
      { ...OUTSIDE_REPOSITORY, 'git add --all': FAILURE },
    )

    expect(commands.at(-1)).toBe('git add --all')
    expect(events.at(-1)).toBe('Could not create the first commit')
  })
})
