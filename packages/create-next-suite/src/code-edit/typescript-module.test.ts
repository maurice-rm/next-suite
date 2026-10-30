import { describe, expect, it } from 'vitest'

import { CodeEditError } from './code-edit-error.ts'
import { openTypescriptModule } from './typescript-module.ts'

const source = (...lines: string[]): string => `${lines.join('\n')}\n`

const NEXT_CONFIG = source(
  'import type { NextConfig } from "next";',
  '',
  'const nextConfig: NextConfig = {',
  '  reactStrictMode: true,',
  '};',
  '',
  'export default nextConfig;',
)

describe('openTypescriptModule', () => {
  it('prints an untouched file byte for byte', () => {
    const text = source('const a = {  b : 1 }', '\t// odd   spacing', 'export default a')

    expect(openTypescriptModule('a.ts', text).print()).toBe(text)
  })

  it('refuses a file that does not parse and names the file', () => {
    expect(() => openTypescriptModule('lib/broken.ts', 'const = 1')).toThrow(CodeEditError)
    expect(() => openTypescriptModule('lib/broken.ts', 'const = 1')).toThrow(
      'lib/broken.ts does not parse',
    )
  })
})

describe('object', () => {
  it('finds the object a top-level variable holds', () => {
    const module = openTypescriptModule('a.ts', source('const config = {', '  a: 1,', '};'))
    module.object('config').set('b', '2')

    expect(module.print()).toBe(source('const config = {', '  a: 1,', '  b: 2,', '};'))
  })

  it('finds an exported variable with a type annotation', () => {
    const module = openTypescriptModule(
      'app/layout.tsx',
      source('export const metadata: Metadata = {', '  title: "a",', '};'),
    )
    module.object('metadata').set('description', '"b"')

    expect(module.print()).toBe(
      source('export const metadata: Metadata = {', '  title: "a",', '  description: "b",', '};'),
    )
  })

  it('finds the object passed to a call', () => {
    const module = openTypescriptModule(
      'lib/logger.ts',
      source('export const logger = pino({', '  level: "info",', '});'),
    )
    module.object('logger').set('timestamp', 'pino.stdTimeFunctions.isoTime')

    expect(module.print()).toBe(
      source(
        'export const logger = pino({',
        '  level: "info",',
        '  timestamp: pino.stdTimeFunctions.isoTime,',
        '});',
      ),
    )
  })

  it('finds a nested object inside a call such as createEnv', () => {
    const module = openTypescriptModule(
      'env.ts',
      source(
        'export const env = createEnv({',
        '  server: {',
        '    LOG_LEVEL: z.string(),',
        '  },',
        '});',
      ),
    )
    module.object('env').object('server').set('DATABASE_URL', 'z.url()')

    expect(module.print()).toBe(
      source(
        'export const env = createEnv({',
        '  server: {',
        '    LOG_LEVEL: z.string(),',
        '    DATABASE_URL: z.url(),',
        '  },',
        '});',
      ),
    )
  })

  it.each([
    ['satisfies', 'const config = { a: 1 } satisfies Config;'],
    ['as', 'const config = { a: 1 } as Config;'],
    ['parentheses', 'const config = ({ a: 1 });'],
    ['a non-null assertion', 'const config = { a: 1 }!;'],
  ])('looks through %s', (_case, line) => {
    const module = openTypescriptModule('a.ts', source(line))
    module.object('config').set('b', '2')

    expect(module.print()).toBe(source(line.replace('a: 1', 'a: 1, b: 2')))
  })

  it('refuses a missing variable and names file and variable', () => {
    const module = openTypescriptModule('lib/logger.ts', source('export const log = pino({});'))

    expect(() => module.object('logger').set('a', '1')).toThrow(CodeEditError)
    expect(() => module.object('logger').set('a', '1')).toThrow(
      'lib/logger.ts: found no top-level variable "logger" with a value',
    )
  })

  it('refuses a variable that holds no object literal', () => {
    const module = openTypescriptModule('a.ts', source('const config = () => ({});'))

    expect(() => module.object('config').set('a', '1')).toThrow(
      'a.ts: variable "config" is no object literal (found ArrowFunctionExpression)',
    )
  })

  it('refuses a call without an object argument', () => {
    const module = openTypescriptModule('a.ts', source('const config = create();'))

    expect(() => module.object('config').set('a', '1')).toThrow(
      'a.ts: variable "config" is a call without an object literal argument',
    )
  })
})

describe('defaultExportObject', () => {
  it('finds an object exported directly', () => {
    const module = openTypescriptModule('a.ts', source('export default {', '  a: 1,', '};'))
    module.defaultExportObject().set('b', '2')

    expect(module.print()).toBe(source('export default {', '  a: 1,', '  b: 2,', '};'))
  })

  it('finds the object through the exported variable', () => {
    const module = openTypescriptModule('next.config.ts', NEXT_CONFIG)
    module.defaultExportObject().set('output', '"standalone"')

    expect(module.print()).toBe(
      NEXT_CONFIG.replace(
        '  reactStrictMode: true,\n',
        '  reactStrictMode: true,\n  output: "standalone",\n',
      ),
    )
  })

  it('finds the object through parentheses around the exported variable', () => {
    const text = NEXT_CONFIG.replace('export default nextConfig;', 'export default (nextConfig);')
    const module = openTypescriptModule('next.config.ts', text)
    module.defaultExportObject().set('output', '"standalone"')

    expect(module.print()).toContain('  reactStrictMode: true,\n  output: "standalone",\n')
  })

  it('finds the object through a wrapper call', () => {
    const module = openTypescriptModule(
      'next.config.ts',
      source('export default withMdx({', '  a: 1,', '});'),
    )
    module.defaultExportObject().set('b', '2')

    expect(module.print()).toBe(source('export default withMdx({', '  a: 1,', '  b: 2,', '});'))
  })

  it('refuses a module without a default export', () => {
    const module = openTypescriptModule('next.config.ts', source('export const a = {};'))

    expect(() => module.defaultExportObject().set('a', '1')).toThrow(
      'next.config.ts: found no default export',
    )
  })
})

describe('wrapDefaultExport', () => {
  it('wraps the exported expression', () => {
    const module = openTypescriptModule('next.config.ts', NEXT_CONFIG)
    module.wrapDefaultExport('withMdx')

    expect(module.print()).toBe(
      NEXT_CONFIG.replace('export default nextConfig;', 'export default withMdx(nextConfig);'),
    )
  })

  it('puts a later wrapper outside an earlier one', () => {
    const module = openTypescriptModule('next.config.ts', NEXT_CONFIG)
    module.wrapDefaultExport('withMdx')
    module.wrapDefaultExport('withNextIntl')

    expect(module.print()).toContain('export default withNextIntl(withMdx(nextConfig));')
  })

  it('wraps inside the parentheses of a parenthesized export', () => {
    const module = openTypescriptModule('next.config.ts', source('export default (nextConfig);'))
    module.wrapDefaultExport('withMdx')

    expect(module.print()).toBe(source('export default (withMdx(nextConfig));'))
  })

  it('keeps an object found through the wrapper', () => {
    const module = openTypescriptModule('next.config.ts', NEXT_CONFIG)
    module.wrapDefaultExport('withMdx')
    module.defaultExportObject().set('output', '"export"')

    expect(module.print()).toContain('  output: "export",\n')
  })

  it('refuses a default export that is a declaration', () => {
    const module = openTypescriptModule(
      'app/page.tsx',
      source('export default function Page() {', '  return null;', '}'),
    )

    expect(() => module.wrapDefaultExport('withAuth')).toThrow(
      'app/page.tsx: the default export is no expression (found FunctionDeclaration)',
    )
  })
})

describe('appendStatement', () => {
  it('adds a statement at the end after a blank line', () => {
    const module = openTypescriptModule('a.ts', source('export const a = 1;'))
    module.appendStatement('export const b = a;')

    expect(module.print()).toBe(source('export const a = 1;', '', 'export const b = a;'))
  })

  it('adds a statement to a file without a final line break or with blank lines', () => {
    const withoutBreak = openTypescriptModule('a.ts', 'export const a = 1;')
    withoutBreak.appendStatement('export const b = a;')
    const withBlankLines = openTypescriptModule('a.ts', 'export const a = 1;\n\n\n')
    withBlankLines.appendStatement('export const b = a;')

    expect(withoutBreak.print()).toBe(source('export const a = 1;', '', 'export const b = a;'))
    expect(withBlankLines.print()).toBe(source('export const a = 1;', '', 'export const b = a;'))
  })

  it('refuses a statement that does not parse, at the operation that adds it', () => {
    const module = openTypescriptModule('lib/logger.ts', source('export const a = 1;'))

    expect(() => module.appendStatement('export const = ;')).toThrow('lib/logger.ts does not parse')
    expect(module.print()).toBe(source('export const a = 1;'))
  })
})

describe('editRaw', () => {
  it('edits through the syntax tree and the text', () => {
    const module = openTypescriptModule('a.ts', source('export const a = 1;'))
    module.editRaw(({ code, program, indentUnit }) => {
      const [statement] = program.body
      code.appendLeft(statement?.end ?? 0, ` // indented by ${JSON.stringify(indentUnit)}`)
    })

    expect(module.print()).toBe(source('export const a = 1; // indented by "  "'))
  })

  it('gives each edit the text of the edits before it', () => {
    const module = openTypescriptModule('a.ts', source('export const a = 1;'))
    module.appendStatement('export const b = 2;')
    module.editRaw(({ program }) => {
      expect(program.body).toHaveLength(2)
    })
  })
})
