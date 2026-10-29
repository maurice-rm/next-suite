import { describe, expect, it } from 'vitest'

import { findProjectDirectoryProblem, projectNameOf } from './project-name.ts'

const CWD = '/work/shop'

describe('projectNameOf', () => {
  it('takes the folder name of a name, a path or the current directory', () => {
    expect(projectNameOf('my-app', CWD)).toBe('my-app')
    expect(projectNameOf('apps/web', CWD)).toBe('web')
    expect(projectNameOf('.', CWD)).toBe('shop')
  })
})

describe('findProjectDirectoryProblem', () => {
  it('accepts a name, a path inside the current directory and "."', () => {
    expect(findProjectDirectoryProblem('my-app', CWD)).toBeUndefined()
    expect(findProjectDirectoryProblem('apps/web', CWD)).toBeUndefined()
    expect(findProjectDirectoryProblem('.', CWD)).toBeUndefined()
  })

  it('requires a name and keeps the project inside the current directory', () => {
    const outside = "Target must be inside the current directory — no '..' or absolute paths."

    expect(findProjectDirectoryProblem('  ', CWD)).toBe('Name or path is required.')
    expect(findProjectDirectoryProblem('../app', CWD)).toBe(outside)
    expect(findProjectDirectoryProblem('/tmp/app', CWD)).toBe(outside)
  })

  it('rejects a folder name that is no valid package name', () => {
    expect(findProjectDirectoryProblem('My App', CWD)).toMatch(/^"My App" is no valid package name/)
  })
})
