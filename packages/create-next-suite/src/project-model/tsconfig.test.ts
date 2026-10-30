import { describe, expect, it } from 'vitest'

import { openTsconfig } from './tsconfig.ts'

const BASE = `${JSON.stringify(
  {
    compilerOptions: { strict: true, paths: { '@/*': ['./*'] } },
    include: ['next-env.d.ts', '**/*.ts'],
  },
  null,
  2,
)}\n`

describe('openTsconfig', () => {
  it('replaces the base alias with the chosen one in its place', () => {
    const tsconfig = openTsconfig(BASE)
    tsconfig.setSourceAlias('~/*', './src/*')

    expect(JSON.parse(tsconfig.print()).compilerOptions.paths).toEqual({ '~/*': ['./src/*'] })
  })

  it('adds a path before the alias and refuses one set twice differently', () => {
    const tsconfig = openTsconfig(BASE)
    tsconfig.addPath('#content/*', ['./content/*'], 'blog')
    tsconfig.addPath('#content/*', ['./content/*'], 'blog')

    expect(Object.keys(JSON.parse(tsconfig.print()).compilerOptions.paths)).toEqual([
      '#content/*',
      '@/*',
    ])
    expect(() => tsconfig.addPath('#content/*', ['./posts/*'], 'docs')).toThrow(
      'blog and docs set the tsconfig path #content/* to different targets',
    )
  })

  it('refuses a path that redefines the alias', () => {
    expect(() => openTsconfig(BASE).addPath('@/*', ['./lib/*'], 'odd')).toThrow(
      'base and odd set the tsconfig path @/* to different targets',
    )
  })

  it('adds include patterns once, before the base ones', () => {
    const tsconfig = openTsconfig(BASE)
    tsconfig.addInclude('.storybook/*.ts')
    tsconfig.addInclude('.storybook/*.ts')
    tsconfig.addInclude('vitest.setup.ts')

    expect(JSON.parse(tsconfig.print()).include).toEqual([
      '.storybook/*.ts',
      'vitest.setup.ts',
      'next-env.d.ts',
      '**/*.ts',
    ])
  })
})
