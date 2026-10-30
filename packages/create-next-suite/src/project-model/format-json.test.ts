import { describe, expect, it } from 'vitest'

import { formatJson } from './format-json.ts'

describe('formatJson', () => {
  it('expands objects and keeps short arrays on one line, like create-next-app', () => {
    expect(
      formatJson({ compilerOptions: { lib: ['dom', 'esnext'], plugins: [{ name: 'next' }] } }),
    ).toBe(
      [
        '{',
        '  "compilerOptions": {',
        '    "lib": ["dom", "esnext"],',
        '    "plugins": [{ "name": "next" }]',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('puts the elements of an array that does not fit on their own lines', () => {
    const include = ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '**/*.mts']

    expect(formatJson({ include })).toBe(
      [
        '{',
        '  "include": [',
        ...include.map(
          (pattern, index) => `    "${pattern}"${index < include.length - 1 ? ',' : ''}`,
        ),
        '  ]',
        '}',
        '',
      ].join('\n'),
    )
  })

  it('writes empty objects and arrays as {} and []', () => {
    expect(formatJson({ a: {}, b: [] })).toBe('{\n  "a": {},\n  "b": []\n}\n')
  })
})
