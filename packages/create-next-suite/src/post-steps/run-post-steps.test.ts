import { describe, expect, it } from 'vitest'

import type { CommandResult } from './run-command.ts'
import { type PostStepsInput, runPostSteps, type StepReporter } from './run-post-steps.ts'

const FORMAT = { script: 'format', running: 'Formatting', done: 'Formatted' }
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
    installArgs: ['install'],
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

const COMMIT =
  'git -c user.name=create-next-suite -c user.email=create-next-suite@users.noreply.github.com commit --no-verify --message chore: initial commit'

describe('runPostSteps', () => {
  it('initializes git on main, installs, runs the scripts and commits, in this order', async () => {
    const { commands, events } = await run({ scripts: [FORMAT] }, OUTSIDE_REPOSITORY)

    expect(commands).toEqual([
      'git rev-parse --is-inside-work-tree',
      'git --version',
      'git init --initial-branch main',
      'pnpm --version',
      'pnpm install',
      'pnpm run format',
      'git add --all',
      'git config user.email',
      COMMIT,
    ])
    expect(events).toEqual([
      'Initialized git repository',
      'Installed dependencies',
      'Formatted',
      'Created initial commit',
    ])
  })

  it('commits with the configured identity when git has one', async () => {
    const { commands } = await run(
      { shouldInstall: false },
      {
        ...OUTSIDE_REPOSITORY,
        'git config user.email': { isSuccess: true, output: 'me@example.com\n' },
      },
    )

    expect(commands.at(-1)).toBe('git commit --no-verify --message chore: initial commit')
  })

  it('reports a missing git as a failed git step', async () => {
    const { commands, events } = await run(
      { shouldInstall: false },
      { ...OUTSIDE_REPOSITORY, 'git --version': FAILURE },
    )

    expect(commands).toEqual(['git rev-parse --is-inside-work-tree', 'git --version'])
    expect(events).toEqual(['Could not initialize git repository'])
  })

  it('skips git inside an existing repository', async () => {
    const { commands, events } = await run({ shouldInstall: false })

    expect(commands).toEqual(['git rev-parse --is-inside-work-tree'])
    expect(events).toEqual([
      'The directory is inside a git repository already — skipping git init.',
    ])
  })

  it('runs nothing the user turned off', async () => {
    const { commands } = await run({ shouldInstall: false, shouldInitializeGit: false })

    expect(commands).toEqual([])
  })

  it('names the command to run when the package manager is not on the PATH', async () => {
    const { commands, events } = await run(
      { shouldInitializeGit: false, scripts: [FORMAT] },
      { 'pnpm --version': FAILURE },
    )

    expect(commands).toEqual(['pnpm --version'])
    expect(events).toEqual([
      'pnpm was not found on your PATH — skipping install. Install it, then run `pnpm install`.',
    ])
  })

  it('rejects Yarn 1 with the way to Yarn 4', async () => {
    const { commands, events } = await run(
      { packageManager: 'yarn', shouldInitializeGit: false },
      { 'yarn --version': { isSuccess: true, output: '1.22.22\n' } },
    )

    expect(commands).toEqual(['yarn --version'])
    expect(events[0]).toMatch(/^Yarn 1 is not supported; .*then run `yarn install`\.$/)
  })

  it('skips the scripts after a failed install, but still commits', async () => {
    const { commands, events } = await run(
      { scripts: [FORMAT] },
      { ...OUTSIDE_REPOSITORY, 'pnpm install': FAILURE },
    )

    expect(commands).not.toContain('pnpm run format')
    expect(commands.at(-1)).toBe(COMMIT)
    expect(events).toContain('Could not install — run `pnpm install` yourself')
  })

  it('names the command for a failed script', async () => {
    const { events } = await run(
      { scripts: [FORMAT], shouldInitializeGit: false },
      { 'pnpm run format': FAILURE },
    )

    expect(events.at(-1)).toBe('Could not run format — run `pnpm run format` yourself')
  })

  it('does not commit when git init failed', async () => {
    const { commands } = await run(
      { shouldInstall: false },
      { ...OUTSIDE_REPOSITORY, 'git init --initial-branch main': FAILURE },
    )

    expect(commands.at(-1)).toBe('git init --initial-branch main')
  })

  it('reports a failed add as a failed commit', async () => {
    const { commands, events } = await run(
      { shouldInstall: false },
      { ...OUTSIDE_REPOSITORY, 'git add --all': FAILURE },
    )

    expect(commands.at(-1)).toBe('git add --all')
    expect(events.at(-1)).toBe('Could not create initial commit')
  })

  it('installs with the arguments of the package manager', async () => {
    const { commands } = await run({
      packageManager: 'yarn',
      installArgs: ['install', '--no-immutable'],
      shouldInitializeGit: false,
    })

    expect(commands).toContain('yarn install --no-immutable')
  })
})
