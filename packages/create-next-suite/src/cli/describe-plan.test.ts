import { describe, expect, it } from 'vitest'

import type { ProjectPlan } from '../compose/compose-project.ts'
import { describePlan, diffPlan } from './describe-plan.ts'

const PLAN: ProjectPlan = {
  files: [
    { path: '.gitignore', content: '.next\nout\n', origin: 'base' },
    { path: 'lib/db.ts', content: 'export {}\n', origin: 'drizzle' },
    { path: 'public/.gitkeep', content: '', origin: 'base' },
  ],
  dependencies: { next: '16.4.3' },
  devDependencies: {},
  packageManager: 'pnpm',
  installArgs: ['install'],
  postSteps: [],
  summary: { stack: [], nextSteps: [] },
}

describe('describePlan', () => {
  it('lists the files with their line count and plugin, then the packages', () => {
    expect(describePlan(PLAN)).toBe(
      [
        'Files:',
        '  .gitignore (2 lines, base)',
        '  lib/db.ts (1 line, drizzle)',
        '  public/.gitkeep (0 lines, base)',
        'Dependencies:',
        '  next 16.4.3',
      ].join('\n'),
    )
  })
})

describe('diffPlan', () => {
  it('shows every file as added lines', () => {
    const diff = diffPlan(PLAN)

    expect(diff).toContain('+++ lib/db.ts')
    expect(diff).toContain('+.next\n+out\n')
  })
})
