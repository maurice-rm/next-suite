import { describe, expect, it } from 'vitest'

import { findUnsafePathProblem } from './find-unsafe-path-problem.ts'

describe('findUnsafePathProblem', () => {
  it.each(['app/page.tsx', '.env.example', 'src/lib/db.ts', '.github/workflows/ci.yml'])(
    'accepts %s',
    (target) => {
      expect(findUnsafePathProblem(target)).toBeUndefined()
    },
  )

  it.each([
    ['a parent segment', '../outside.ts', 'segment ".."'],
    ['a nested parent segment', 'app/../../outside.ts', 'segment ".."'],
    ['a current segment', './app/page.tsx', 'segment "."'],
    ['an empty segment', 'app//page.tsx', 'empty segment'],
    ['an absolute path', '/etc/passwd', 'is absolute'],
    ['a Windows drive', 'C:/Windows/win.ini', 'is absolute'],
    ['a backslash', 'app\\page.tsx', 'backslash'],
    ['a null character', 'app/page.tsx\u0000.png', 'control character'],
    ['an encoded parent segment', '%2e%2e/outside.ts', 'segment ".."'],
    ['a double-encoded parent segment', '%252e%252e/outside.ts', 'segment ".."'],
    ['an encoded backslash', '..%5coutside.ts', 'backslash'],
    ['a path into .git', '.git/hooks/pre-commit', 'segment ".git"'],
    ['a nested .git', 'vendor/.git/config', 'segment ".git"'],
    ['.git in another case', '.GIT/config', 'segment ".GIT"'],
  ])('rejects %s', (_case, target, problem) => {
    expect(findUnsafePathProblem(target)).toContain(problem)
  })
})
