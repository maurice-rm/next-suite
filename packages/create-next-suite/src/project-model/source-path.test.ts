import { describe, expect, it } from 'vitest'

import { aliasTarget, rewriteSourceAlias, toDiskPath } from './source-path.ts'

describe('toDiskPath', () => {
  it('puts a source path under src/ or the project root', () => {
    expect(toDiskPath('@/lib/auth.ts', true)).toBe('src/lib/auth.ts')
    expect(toDiskPath('@/lib/auth.ts', false)).toBe('lib/auth.ts')
  })

  it('keeps a path without @/ in the project root', () => {
    expect(toDiskPath('next.config.ts', true)).toBe('next.config.ts')
  })
})

describe('aliasTarget', () => {
  it('points the alias at src/ or the project root', () => {
    expect(aliasTarget(true)).toBe('./src/*')
    expect(aliasTarget(false)).toBe('./*')
  })
})

describe('rewriteSourceAlias', () => {
  it('rewrites @/ imports of a script file to the chosen alias', () => {
    expect(rewriteSourceAlias('lib/a.ts', 'import { env } from "@/env";\n', '~/*')).toBe(
      'import { env } from "~/env";\n',
    )
  })

  it('leaves other files and the default alias alone', () => {
    const text = 'import { env } from "@/env";\n'

    expect(rewriteSourceAlias('README.md', text, '~/*')).toBe(text)
    expect(rewriteSourceAlias('lib/a.ts', text, '@/*')).toBe(text)
  })
})
