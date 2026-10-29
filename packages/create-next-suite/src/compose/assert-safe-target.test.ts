import { describe, expect, it } from 'vitest'

import { assertSafeTarget } from './assert-safe-target.ts'

describe('assertSafeTarget', () => {
  it.each(['app/page.tsx', '.env.example', 'src/lib/db.ts', '.github/workflows/ci.yml'])(
    'accepts %s',
    (target) => {
      expect(() => assertSafeTarget(target, 'acme')).not.toThrow()
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
  ])('rejects %s', (_case, target, problem) => {
    expect(() => assertSafeTarget(target, 'acme')).toThrow(problem)
  })

  it('names the plugin and the target', () => {
    expect(() => assertSafeTarget('../x', 'acme')).toThrow('acme writes to "../x"')
  })
})
