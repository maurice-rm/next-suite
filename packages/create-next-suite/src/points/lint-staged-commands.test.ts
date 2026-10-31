import { describe, expect, it } from 'vitest'

import { createLintStagedCommands } from './lint-staged-commands.ts'

describe('createLintStagedCommands', () => {
  it('keeps each glob with its commands in the order they were first given', () => {
    const lintStaged = createLintStagedCommands()
    lintStaged.run('*.ts', 'eslint --fix')
    lintStaged.run('*', 'prettier --write --ignore-unknown')
    lintStaged.run('*.ts', 'eslint --fix')

    expect(lintStaged.commands()).toEqual(
      new Map([
        ['*.ts', ['eslint --fix']],
        ['*', ['prettier --write --ignore-unknown']],
      ]),
    )
  })
})
