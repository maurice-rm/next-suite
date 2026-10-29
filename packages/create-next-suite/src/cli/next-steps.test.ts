import { describe, expect, it } from 'vitest'

import { listNextSteps } from './next-steps.ts'

const commandsOf = (input: Parameters<typeof listNextSteps>[0]) =>
  listNextSteps(input).map((step) => step.command)

describe('listNextSteps', () => {
  it('changes into the project, starts services, installs if needed, then runs the scripts', () => {
    expect(
      commandsOf({
        directory: 'apps/shop',
        cwd: '/work',
        packageManager: 'pnpm',
        isInstalled: false,
        nextSteps: [
          { script: 'db:migrate' },
          { command: 'docker compose up -d' },
          { script: 'dev' },
        ],
      }),
    ).toEqual([
      'cd apps/shop',
      'docker compose up -d',
      'pnpm install',
      'pnpm run db:migrate',
      'pnpm run dev',
    ])
  })

  it('stays in the current directory and skips a done install', () => {
    expect(
      commandsOf({
        directory: './',
        cwd: '/work',
        packageManager: 'bun',
        isInstalled: true,
        nextSteps: [{ script: 'dev' }],
      }),
    ).toEqual(['bun run dev'])
  })

  it('quotes a path with spaces', () => {
    expect(
      commandsOf({
        directory: 'my apps/shop',
        cwd: '/work',
        packageManager: 'npm',
        isInstalled: true,
        nextSteps: [],
      }),
    ).toEqual(['cd "my apps/shop"'])
  })
})
