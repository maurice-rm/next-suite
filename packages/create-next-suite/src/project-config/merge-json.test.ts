import { describe, expect, it } from 'vitest'

import { mergeJson } from './merge-json.ts'

const BASE = {
  name: 'app',
  scripts: { dev: 'next dev', build: 'next build' },
  private: true,
}

describe('mergeJson', () => {
  it('takes a key next-suite changed and keeps a key you changed', () => {
    const merged = mergeJson({
      base: BASE,
      ours: {
        ...BASE,
        scripts: { ...BASE.scripts, studio: 'drizzle-kit studio' },
      },
      theirs: {
        ...BASE,
        scripts: { ...BASE.scripts, build: 'next build --turbo' },
      },
    })

    expect(merged).toEqual({
      value: {
        name: 'app',
        scripts: {
          dev: 'next dev',
          build: 'next build --turbo',
          studio: 'drizzle-kit studio',
        },
        private: true,
      },
      conflicts: [],
    })
  })

  it('removes a key next-suite no longer writes and you did not change', () => {
    const merged = mergeJson({
      base: BASE,
      ours: BASE,
      theirs: { ...BASE, scripts: { dev: 'next dev' } },
    })

    expect(merged.value).toEqual({ ...BASE, scripts: { dev: 'next dev' } })
  })

  it('reports a key both sides changed differently with both values and keeps yours', () => {
    const merged = mergeJson({
      base: BASE,
      ours: {
        ...BASE,
        scripts: { ...BASE.scripts, dev: 'next dev --port 4000' },
      },
      theirs: {
        ...BASE,
        scripts: { ...BASE.scripts, dev: 'next dev --turbopack' },
      },
    })

    expect(merged.value).toEqual({
      ...BASE,
      scripts: { ...BASE.scripts, dev: 'next dev --port 4000' },
    })
    expect(merged.conflicts).toEqual([
      {
        path: 'scripts.dev',
        ours: 'next dev --port 4000',
        theirs: 'next dev --turbopack',
      },
    ])
  })

  it('reports a key you removed that next-suite changed', () => {
    const { scripts: _scripts, ...withoutScripts } = BASE
    const merged = mergeJson({
      base: BASE,
      ours: withoutScripts,
      theirs: { ...BASE, scripts: { ...BASE.scripts, lint: 'eslint' } },
    })

    expect(merged.value).toEqual(withoutScripts)
    expect(merged.conflicts).toEqual([
      {
        path: 'scripts',
        ours: undefined,
        theirs: { ...BASE.scripts, lint: 'eslint' },
      },
    ])
  })

  it('treats an array as one value', () => {
    const merged = mergeJson({
      base: { include: ['a'] },
      ours: { include: ['a', 'mine'] },
      theirs: { include: ['a', 'theirs'] },
    })

    expect(merged.conflicts).toEqual([
      { path: 'include', ours: ['a', 'mine'], theirs: ['a', 'theirs'] },
    ])
  })

  it('keeps sorted keys sorted, such as dependencies', () => {
    const merged = mergeJson({
      base: { dependencies: { next: '16.0.0', react: '19.0.0' } },
      ours: { dependencies: { next: '16.0.0', react: '19.0.0', zod: '4.0.0' } },
      theirs: {
        dependencies: { next: '16.0.0', pino: '10.0.0', react: '19.0.0' },
      },
    })

    expect(Object.keys((merged.value as { dependencies: object }).dependencies)).toEqual([
      'next',
      'pino',
      'react',
      'zod',
    ])
  })

  it('merges against no base, as for a file both sides added', () => {
    const merged = mergeJson({
      base: undefined,
      ours: { a: 1, b: 2 },
      theirs: { a: 1, b: 3 },
    })

    expect(merged).toEqual({
      value: { a: 1, b: 2 },
      conflicts: [{ path: 'b', ours: 2, theirs: 3 }],
    })
  })
})
