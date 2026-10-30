import { describe, expectTypeOf, it } from 'vitest'

import type { TypescriptModule } from '../code-edit/typescript-module.ts'
import {
  type CspSources,
  csp,
  type Dialect,
  database,
  type OrmKind,
  orm,
} from '../test-support/fixture-points.ts'
import { definePlugin } from './define-plugin.ts'
import { optional } from './optional.ts'

const NAMES = { name: 'acme', title: 'Acme' }

describe('the context of a plugin', () => {
  it('holds the value of each used point in every function', () => {
    definePlugin({
      ...NAMES,
      uses: { orm },
      dependencies: ({ orm }) => {
        expectTypeOf(orm.kind).toEqualTypeOf<OrmKind>()
        expectTypeOf(orm.dialect).toEqualTypeOf<Dialect>()
        return {}
      },
      files: {
        '@/lib/acme.ts': {
          source: 'files/acme.ts',
          edit: (module, { orm, env }) => {
            expectTypeOf(module).toEqualTypeOf<TypescriptModule>()
            expectTypeOf(orm.client.name).toEqualTypeOf<string>()
            expectTypeOf(env).items.toHaveProperty('scope').toEqualTypeOf<'server' | 'client'>()
          },
        },
      },
    })
  })

  it('gives true for a used collector point and undefined for an optional point', () => {
    definePlugin({
      ...NAMES,
      uses: { csp, database: optional(database), maybeCsp: optional(csp) },
      env: ({ csp, database, maybeCsp }) => {
        expectTypeOf(csp).toEqualTypeOf<true>()
        expectTypeOf(database).toEqualTypeOf<{ dialect: Dialect } | undefined>()
        expectTypeOf(maybeCsp).toEqualTypeOf<true | undefined>()
        return {}
      },
    })
  })

  it('narrows each answer to its option', () => {
    definePlugin({
      ...NAMES,
      options: {
        level: { question: 'Level?', choices: ['debug', 'info'], default: 'info' },
        strict: { type: 'boolean', question: 'Strict?', default: true },
        router: {
          question: 'Router?',
          choices: [
            { value: 'app', label: 'App Router', description: 'The default.' },
            { value: 'pages', label: 'Pages Router' },
          ],
          default: 'app',
        },
        tools: { type: 'multiselect', question: 'Tools?', choices: ['a', 'b'], default: ['a'] },
      },
      scripts: ({ options }) => {
        expectTypeOf(options.level).toEqualTypeOf<'debug' | 'info'>()
        expectTypeOf(options.strict).toEqualTypeOf<boolean>()
        expectTypeOf(options.router).toEqualTypeOf<'app' | 'pages'>()
        expectTypeOf(options.tools).toEqualTypeOf<readonly ('a' | 'b')[]>()
        return {}
      },
    })
  })

  it('hands the provider of a collector point what it created', () => {
    definePlugin({
      ...NAMES,
      collects: {
        csp: {
          create: (): CspSources => ({ allow: () => undefined, directives: () => new Map() }),
          finish: (collected, { module, write }) => {
            expectTypeOf(collected).toEqualTypeOf<CspSources>()
            expectTypeOf(module).returns.toEqualTypeOf<TypescriptModule>()
            expectTypeOf(write).parameters.toEqualTypeOf<[path: string, content: string]>()
          },
        },
      },
    })
  })
})

describe('a plugin definition rejects', () => {
  it('a misspelled section', () => {
    definePlugin({
      ...NAMES,
      // @ts-expect-error devDependecies is no section
      devDependecies: { vitest: '5.0.5' },
    })
  })

  it('an unknown environment scope', () => {
    definePlugin({
      ...NAMES,
      env: {
        // @ts-expect-error the scope is server or client
        API_KEY: { scope: 'browser', description: 'The key.' },
      },
    })
  })

  it('a default that is not a choice', () => {
    definePlugin({
      ...NAMES,
      options: {
        // @ts-expect-error verbose is not a choice
        level: { question: 'Level?', choices: ['debug', 'info'], default: 'verbose' },
      },
    })
    definePlugin({
      ...NAMES,
      options: {
        // @ts-expect-error a boolean option defaults to true or false
        strict: { type: 'boolean', question: 'Strict?', default: 'yes' },
      },
    })
    definePlugin({
      ...NAMES,
      options: {
        // @ts-expect-error c is not a choice
        tools: { type: 'multiselect', question: 'Tools?', choices: ['a', 'b'], default: ['c'] },
      },
    })
  })

  it('an answer compared to a value it cannot have', () => {
    definePlugin({
      ...NAMES,
      options: {
        level: { question: 'Level?', choices: ['debug', 'info'], default: 'info' },
      },
      // @ts-expect-error verbose is not a choice
      scripts: ({ options }) => (options.level === 'verbose' ? { log: 'echo' } : {}),
    })
  })

  it('a misspelled field of an option', () => {
    definePlugin({
      ...NAMES,
      options: {
        // @ts-expect-error descripton is no field of an option
        strict: { type: 'boolean', question: 'Strict?', default: true, descripton: 'x' },
      },
    })
  })

  it('an extension of a point that does not exist', () => {
    definePlugin({
      ...NAMES,
      extend: {
        // @ts-expect-error there is no point cssp
        cssp: () => undefined,
      },
    })
  })

  it('a contribution the point does not accept', () => {
    definePlugin({
      ...NAMES,
      extend: {
        csp: (sources) => {
          expectTypeOf(sources).toEqualTypeOf<CspSources>()
          // @ts-expect-error script-source is no CSP directive
          sources.allow('script-source', 'https://example.com')
        },
      },
    })
  })

  it('an optional point read without a check', () => {
    definePlugin({
      ...NAMES,
      uses: { database: optional(database) },
      // @ts-expect-error an optional point can be undefined
      gitignore: ({ database }) => [database.dialect],
    })
  })

  it('a provided value that does not match the point', () => {
    definePlugin({
      ...NAMES,
      provides: {
        // @ts-expect-error mysql is no dialect
        database: { dialect: 'mysql' },
      },
    })
  })

  it('a value point under collects and a collector point under provides', () => {
    definePlugin({
      ...NAMES,
      // @ts-expect-error database is a value point
      collects: { database: { create: () => ({ dialect: 'sqlite' }), finish: () => undefined } },
    })
    definePlugin({
      ...NAMES,
      provides: {
        // @ts-expect-error csp is a collector point
        csp: { allow: () => undefined, directives: () => new Map() },
      },
    })
  })

  it('an ORM kind the point does not know', () => {
    definePlugin({
      ...NAMES,
      uses: { orm },
      // @ts-expect-error kysely is no ORM kind
      dependencies: ({ orm }) => (orm.kind === 'kysely' ? { kysely: '0.28.0' } : {}),
    })
  })

  it('a used point named like a context helper', () => {
    definePlugin({
      ...NAMES,
      // @ts-expect-error options is a name of the context
      uses: { options: orm },
    })
  })

  it('a function as metadata', () => {
    definePlugin({
      ...NAMES,
      // @ts-expect-error a title is a fixed value
      title: () => 'Acme',
    })
  })

  it('a direct edit before everything is collected', () => {
    definePlugin({
      ...NAMES,
      layout: (context) => {
        // @ts-expect-error module is available in edits and finish only
        context.module('@/lib/logger.ts')
        return {}
      },
    })
  })
})
