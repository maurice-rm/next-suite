import { describe, expect, it } from 'vitest'

import { CodeEditError } from './code-edit-error.ts'
import type { ObjectLiteral } from './object-literal.ts'
import { openTypescriptModule } from './typescript-module.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

/** Opens `text`, runs `change` on the object of the variable `config` and prints the result. */
const editConfig = (text: string, change: (config: ObjectLiteral) => void): string => {
  const module = openTypescriptModule('config.ts', text)
  change(module.object('config'))
  return module.print()
}

describe('set', () => {
  it('adds a property on its own line and keeps a trailing comma', () => {
    const text = source('const config = {', '  a: 1,', '};')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  a: 1,', '  b: 2,', '};'),
    )
  })

  it('adds a property without a trailing comma where the file has none', () => {
    const text = source('const config = {', '  a: 1', '}')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  a: 1,', '  b: 2', '}'),
    )
  })

  it('adds a property to an object on one line inline', () => {
    const text = source('const config = { a: 1 };')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = { a: 1, b: 2 };'),
    )
  })

  it('indents a value that spans lines in an object on one line', () => {
    const text = source('const config = { a: 1 };')

    expect(editConfig(text, (config) => config.set('b', '{\nc: 1,\n}'))).toBe(
      source('const config = { a: 1, b: {', '  c: 1,', '} };'),
    )
  })

  it('opens an empty object into lines', () => {
    const text = source('const config = {};')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  b: 2,', '};'),
    )
  })

  it('keeps a comment inside an empty object first', () => {
    const text = source('const config = {', '  client: { /* none yet */ },', '};')

    expect(
      editConfig(text, (config) => config.object('client').set('NEXT_PUBLIC_URL', 'z.url()')),
    ).toBe(
      source(
        'const config = {',
        '  client: {',
        '    /* none yet */',
        '    NEXT_PUBLIC_URL: z.url(),',
        '  },',
        '};',
      ),
    )
  })

  it('keeps the comment after the last property on its line', () => {
    const text = source('const config = {', '  a: 1, // keep', '};')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  a: 1, // keep', '  b: 2,', '};'),
    )
  })

  it('adds the comma before a comment after the last property', () => {
    const text = source('const config = {', '  a: 1 // keep', '}')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  a: 1, // keep', '  b: 2', '}'),
    )
  })

  it('keeps a trailing comma written after a block comment', () => {
    const text = source('const config = {', '  a: 1 /* one */,', '};')

    expect(editConfig(text, (config) => config.set('b', '2'))).toBe(
      source('const config = {', '  a: 1 /* one */,', '  b: 2,', '};'),
    )
  })

  it('replaces the value of an existing property', () => {
    const text = source('const config = {', '  level: "info",', '  a: 1,', '};')

    expect(editConfig(text, (config) => config.set('level', '"debug"'))).toBe(
      source('const config = {', '  level: "debug",', '  a: 1,', '};'),
    )
  })

  it('replaces a method without leaving a duplicate key', () => {
    const text = source(
      'const config = {',
      '  async headers() {',
      '    return [];',
      '  },',
      '  a: 1,',
      '};',
    )

    expect(editConfig(text, (config) => config.set('headers', 'async () => securityHeaders'))).toBe(
      source('const config = {', '  headers: async () => securityHeaders,', '  a: 1,', '};'),
    )
  })

  it('replaces a shorthand property', () => {
    const text = source('const config = { level, a: 1 };')

    expect(editConfig(text, (config) => config.set('level', '"debug"'))).toBe(
      source('const config = { level: "debug", a: 1 };'),
    )
  })

  it('finds a property written as a string key', () => {
    const text = source('const config = { "script-src": "a" };')

    expect(editConfig(text, (config) => config.set('script-src', '"b"'))).toBe(
      source('const config = { "script-src": "b" };'),
    )
  })

  it('quotes a new key that is no identifier in the quotes of the file', () => {
    const doubleQuoted = source('import { a } from "a";', 'const config = { a };')
    const singleQuoted = source("import { a } from 'a'", 'const config = { a }')

    expect(editConfig(doubleQuoted, (config) => config.set('script-src', '"self"'))).toBe(
      source('import { a } from "a";', 'const config = { a, "script-src": "self" };'),
    )
    expect(editConfig(singleQuoted, (config) => config.set('script-src', "'self'"))).toBe(
      source("import { a } from 'a'", "const config = { a, 'script-src': 'self' }"),
    )
  })

  it('indents a value that spans lines by its brackets', () => {
    const text = source('const config = {', '  a: 1,', '};')

    expect(
      editConfig(text, (config) => config.set('title', '{\ndefault: "x",\ntemplate: "%s | x",\n}')),
    ).toBe(
      source(
        'const config = {',
        '  a: 1,',
        '  title: {',
        '    default: "x",',
        '    template: "%s | x",',
        '  },',
        '};',
      ),
    )
  })

  it('indents a replaced value that spans lines at the depth of its property', () => {
    const text = source('const config = {', '  nested: {', '    title: "a",', '  },', '};')

    expect(
      editConfig(text, (config) => config.object('nested').set('title', '{\ndefault: "x",\n}')),
    ).toBe(
      source(
        'const config = {',
        '  nested: {',
        '    title: {',
        '      default: "x",',
        '    },',
        '  },',
        '};',
      ),
    )
  })

  it('indents with tabs in a file indented with tabs', () => {
    const text = source('const config = {', '\ta: 1,', '};')

    expect(editConfig(text, (config) => config.set('b', '{\nc: 1,\n}'))).toBe(
      source('const config = {', '\ta: 1,', '\tb: {', '\t\tc: 1,', '\t},', '};'),
    )
  })

  it('indents by four spaces in a file indented by four spaces', () => {
    const text = source('const config = {', '    a: 1,', '};')

    expect(editConfig(text, (config) => config.set('b', '{\nc: 1,\n}'))).toBe(
      source('const config = {', '    a: 1,', '    b: {', '        c: 1,', '    },', '};'),
    )
  })

  it('reads the indentation past the lines of a doc comment', () => {
    const text = source('/**', ' * The config.', ' */', 'const config = {', '  a: 1,', '};')

    expect(editConfig(text, (config) => config.set('b', '{\nc: 1,\n}'))).toBe(
      source(
        '/**',
        ' * The config.',
        ' */',
        'const config = {',
        '  a: 1,',
        '  b: {',
        '    c: 1,',
        '  },',
        '};',
      ),
    )
  })

  it('leaves the lines of a template literal in a value as they are', () => {
    const text = source('const config = {};')

    expect(editConfig(text, (config) => config.set('banner', '`\n  {kept}\n`'))).toBe(
      source('const config = {', '  banner: `', '  {kept}', '`,', '};'),
    )
  })

  it('refuses a value that does not parse', () => {
    const text = source('const config = {};')

    expect(() => editConfig(text, (config) => config.set('a', '1 +'))).toThrow(CodeEditError)
  })
})

describe('get', () => {
  it('answers the code of a property value', () => {
    const module = openTypescriptModule('config.ts', source('const config = { level: "info" };'))

    expect(module.object('config').get('level')).toBe('"info"')
  })

  it('answers the whole method for a method', () => {
    const module = openTypescriptModule(
      'config.ts',
      source('const config = { async headers() { return []; } };'),
    )

    expect(module.object('config').get('headers')).toBe('async headers() { return []; }')
  })

  it('answers undefined for a missing property', () => {
    const module = openTypescriptModule('config.ts', source('const config = {};'))

    expect(module.object('config').get('level')).toBeUndefined()
  })
})

describe('object', () => {
  it('adds a missing nested object and edits inside it', () => {
    const text = source('const config = {', '  server: {},', '};')

    expect(editConfig(text, (config) => config.object('client').set('URL', 'z.url()'))).toBe(
      source('const config = {', '  server: {},', '  client: {', '    URL: z.url(),', '  },', '};'),
    )
  })

  it('gives each nested object its own properties', () => {
    const text = source('const config = {};')

    expect(
      editConfig(text, (config) => {
        const images = config.object('images')
        images.set('unoptimized', 'true')
        images.set('formats', '["image/avif"]')
      }),
    ).toBe(
      source(
        'const config = {',
        '  images: {',
        '    unoptimized: true,',
        '    formats: ["image/avif"],',
        '  },',
        '};',
      ),
    )
  })

  it('looks through satisfies on a nested object', () => {
    const text = source('const config = { images: { a: 1 } satisfies Images };')

    expect(editConfig(text, (config) => config.object('images').set('b', '2'))).toBe(
      source('const config = { images: { a: 1, b: 2 } satisfies Images };'),
    )
  })

  it('refuses a property that holds no object and names file and property', () => {
    const text = source('const config = { images: false };')

    expect(() => editConfig(text, (config) => config.object('images').set('a', '1'))).toThrow(
      'config.ts: property "images" of variable "config" is no object literal (found Literal)',
    )
  })
})

describe('addToArray', () => {
  it('appends to an array that spans lines and keeps a trailing comma', () => {
    const text = source('const config = {', '  redact: [', '    "a",', '  ],', '};')

    expect(editConfig(text, (config) => config.addToArray('redact', '"b"', '"c"'))).toBe(
      source('const config = {', '  redact: [', '    "a",', '    "b",', '    "c",', '  ],', '};'),
    )
  })

  it('appends to an array that spans lines without a trailing comma', () => {
    const text = source('const config = {', '  redact: [', '    "a"', '  ]', '}')

    expect(editConfig(text, (config) => config.addToArray('redact', '"b"'))).toBe(
      source('const config = {', '  redact: [', '    "a",', '    "b"', '  ]', '}'),
    )
  })

  it('appends inline to an array on one line', () => {
    const text = source('const config = { redact: ["a"] };')

    expect(editConfig(text, (config) => config.addToArray('redact', '"b"'))).toBe(
      source('const config = { redact: ["a", "b"] };'),
    )
  })

  it('keeps each element once', () => {
    const text = source('const config = { redact: ["a"] };')

    expect(editConfig(text, (config) => config.addToArray('redact', '"a"', '"b"', '"b"'))).toBe(
      source('const config = { redact: ["a", "b"] };'),
    )
  })

  it('leaves the file untouched when every element is present', () => {
    const text = source('const config = { redact: ["a"] };')

    expect(editConfig(text, (config) => config.addToArray('redact', '"a"'))).toBe(text)
  })

  it('adds a missing array inline', () => {
    const text = source('const config = {', '  level: "info",', '};')

    expect(editConfig(text, (config) => config.addToArray('redact', '"a"', '"b"'))).toBe(
      source('const config = {', '  level: "info",', '  redact: ["a", "b"],', '};'),
    )
  })

  it('keeps the comment after the last element on its line', () => {
    const text = source('const config = {', '  redact: [', '    "a", // auth', '  ],', '};')

    expect(editConfig(text, (config) => config.addToArray('redact', '"b"'))).toBe(
      source('const config = {', '  redact: [', '    "a", // auth', '    "b",', '  ],', '};'),
    )
  })

  it('keeps a comment inside an empty array that spans lines first', () => {
    const text = source('const config = {', '  redact: [', '    // none yet', '  ],', '};')

    expect(editConfig(text, (config) => config.addToArray('redact', '"a"'))).toBe(
      source('const config = {', '  redact: [', '    // none yet', '    "a",', '  ],', '};'),
    )
  })

  it('refuses a property that holds no array', () => {
    const text = source('const config = { redact: "a" };')

    expect(() => editConfig(text, (config) => config.addToArray('redact', '"b"'))).toThrow(
      'config.ts: property "redact" of variable "config" is no array literal (found Literal)',
    )
  })
})

describe('removeFromArray', () => {
  it('removes an element inside an array that spans lines', () => {
    const text = source(
      'const config = {',
      '  plugins: [',
      '    "a",',
      '    "b",',
      '    "c",',
      '  ],',
      '};',
    )

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(
      source('const config = {', '  plugins: [', '    "a",', '    "c",', '  ],', '};'),
    )
  })

  it('keeps the comment above the next element', () => {
    const text = source(
      'const config = {',
      '  plugins: [',
      '    "a", // first',
      '    // about b',
      '    "b",',
      '  ],',
      '};',
    )

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"a"'))).toBe(
      source('const config = {', '  plugins: [', '    // about b', '    "b",', '  ],', '};'),
    )
  })

  it('removes the last element and keeps the comment of the previous line', () => {
    const text = source(
      'const config = {',
      '  plugins: [',
      '    "a", // keep me',
      '    "b",',
      '  ],',
      '};',
    )

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(
      source('const config = {', '  plugins: [', '    "a", // keep me', '  ],', '};'),
    )
  })

  it('removes the comma the previous element gains when the list had no trailing comma', () => {
    const text = source(
      'const config = {',
      '  plugins: [',
      '    "a", // keep me',
      '    "b"',
      '  ]',
      '}',
    )

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(
      source('const config = {', '  plugins: [', '    "a" // keep me', '  ]', '}'),
    )
  })

  it('removes the last element when the closing bracket shares its line', () => {
    const text = source('const config = {', '  plugins: [', '    "a",', '    "b"],', '};')

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(
      source('const config = {', '  plugins: [', '    "a"],', '};'),
    )
  })

  it('removes an element of an array on one line', () => {
    const text = source('const config = { plugins: ["a", "b", "c"] };')

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(
      source('const config = { plugins: ["a", "c"] };'),
    )
    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"c"'))).toBe(
      source('const config = { plugins: ["a", "b"] };'),
    )
  })

  it('removes the only element', () => {
    const inline = source('const config = { plugins: ["a"] };')
    const onLines = source('const config = {', '  plugins: [', '    "a",', '  ],', '};')

    expect(editConfig(inline, (config) => config.removeFromArray('plugins', '"a"'))).toBe(
      source('const config = { plugins: [] };'),
    )
    expect(editConfig(onLines, (config) => config.removeFromArray('plugins', '"a"'))).toBe(
      source('const config = {', '  plugins: [],', '};'),
    )
  })

  it('leaves the file untouched for a missing element or a missing array', () => {
    const text = source('const config = { plugins: ["a"] };')

    expect(editConfig(text, (config) => config.removeFromArray('plugins', '"b"'))).toBe(text)
    expect(editConfig(text, (config) => config.removeFromArray('other', '"a"'))).toBe(text)
  })
})
