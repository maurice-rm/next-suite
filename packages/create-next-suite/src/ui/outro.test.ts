import ansis from 'ansis'
import { describe, expect, it } from 'vitest'

import { renderOutroSummary } from './outro.ts'

describe('renderOutroSummary', () => {
  it('shows the ready project, its stack, the next steps and the docs link', () => {
    const lines = ansis
      .strip(
        renderOutroSummary({
          projectName: 'my-app',
          stack: ['Next.js', 'TypeScript'],
          nextSteps: [
            { command: 'cd my-app', packageManager: undefined },
            { command: 'pnpm run dev', packageManager: 'pnpm' },
          ],
          docsLink: 'github.com/maurice-rm/next-suite',
        }),
      )
      .split('\n')

    expect(lines.slice(1, 8)).toEqual([
      '◇  my-app is ready',
      '│   ↳ Next.js · TypeScript',
      '│',
      '│  Next steps',
      '│    cd my-app',
      '│    pnpm run dev',
      '└  Docs → github.com/maurice-rm/next-suite',
    ])
  })
})
