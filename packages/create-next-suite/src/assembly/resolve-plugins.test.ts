import { describe, expect, it } from 'vitest'

import { definePlugin } from '../plugin-definition/define-plugin.ts'
import { optional } from '../plugin-definition/optional.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { createCspSources, csp, database, orm } from '../test-support/fixture-points.ts'
import { AssemblyError } from './assembly-error.ts'
import { resolvePlugins } from './resolve-plugins.ts'

const CATEGORY_ORDER = ['package-manager', 'database', 'orm', 'auth', 'styling', 'analytics']
const ORM = { kind: 'drizzle', dialect: 'sqlite', client: { name: 'db', from: '@/db' } } as const
const CSP = { create: createCspSources, finish: () => undefined }

const resolve = (...plugins: Plugin[]) =>
  resolvePlugins({
    plugins: plugins.map((plugin) => ({ plugin, readFile: () => '' })),
    categoryOrder: CATEGORY_ORDER,
  })

const order = (...plugins: Plugin[]): string[] =>
  resolve(...plugins).plugins.map(({ plugin }) => plugin.name)

describe('resolvePlugins', () => {
  it('runs a provider before the plugins that use its point, whatever the categories', () => {
    const auth = definePlugin({
      name: 'auth',
      title: 'Auth',
      category: 'package-manager',
      uses: { orm },
    })
    const drizzle = definePlugin({
      name: 'drizzle',
      title: 'Drizzle',
      category: 'analytics',
      provides: { orm: ORM },
    })

    expect(order(auth, drizzle)).toEqual(['drizzle', 'auth'])
  })

  it('keeps the category order, then the selection order, and runs extras last', () => {
    const extra = definePlugin({ name: 'extra', title: 'Extra' })
    const analytics = definePlugin({ name: 'analytics', title: 'A', category: 'analytics' })
    const tailwind = definePlugin({ name: 'tailwind', title: 'T', category: 'styling' })
    const modules = definePlugin({ name: 'css-modules', title: 'M', category: 'styling' })
    const unknown = definePlugin({ name: 'unknown', title: 'U', category: 'not-listed' })

    expect(order(extra, analytics, modules, unknown, tailwind)).toEqual([
      'css-modules',
      'tailwind',
      'analytics',
      'extra',
      'unknown',
    ])
  })

  it('records the provider of each point', () => {
    const drizzle = definePlugin({ name: 'drizzle', title: 'D', provides: { orm: ORM } })
    const headers = definePlugin({ name: 'headers', title: 'H', collects: { csp: CSP } })

    expect(resolve(drizzle, headers).providers).toEqual(
      new Map([
        ['orm', 'drizzle'],
        ['csp', 'headers'],
      ]),
    )
  })

  it('names the plugins that use each other’s points', () => {
    const first = definePlugin({
      name: 'first',
      title: 'First',
      uses: { orm },
      provides: { database: { dialect: 'sqlite' } },
    })
    const second = definePlugin({
      name: 'second',
      title: 'Second',
      uses: { database },
      provides: { orm: ORM },
    })

    expect(() => order(first, second)).toThrow(AssemblyError)
    expect(() => order(first, second)).toThrow(
      "These plugins use each other's points: first → second → first",
    )
  })

  it('refuses a plugin that uses a point it provides', () => {
    const drizzle = definePlugin({
      name: 'drizzle',
      title: 'Drizzle',
      uses: { orm },
      provides: { orm: ORM },
    })

    expect(() => order(drizzle)).toThrow('drizzle uses the point "orm", which it provides itself')
  })

  it('names a required point no plugin provides and passes over an optional one', () => {
    const auth = definePlugin({ name: 'auth', title: 'Auth', uses: { orm } })
    const headers = definePlugin({ name: 'headers', title: 'H', uses: { csp } })
    const analytics = definePlugin({ name: 'analytics', title: 'A', uses: { csp: optional(csp) } })

    expect(() => order(auth)).toThrow(
      'auth uses the point "orm", which no selected plugin provides',
    )
    expect(() => order(headers)).toThrow(
      'headers uses the point "csp", which no selected plugin provides',
    )
    expect(order(analytics)).toEqual(['analytics'])
  })

  it('names both providers of a point', () => {
    const drizzle = definePlugin({ name: 'drizzle', title: 'D', provides: { orm: ORM } })
    const prisma = definePlugin({ name: 'prisma', title: 'P', provides: { orm: ORM } })
    const first = definePlugin({ name: 'first', title: 'F', collects: { csp: CSP } })
    const second = definePlugin({ name: 'second', title: 'S', collects: { csp: CSP } })

    expect(() => order(drizzle, prisma)).toThrow('Both drizzle and prisma provide the point "orm"')
    expect(() => order(first, second)).toThrow('Both first and second provide the point "csp"')
  })

  it('drops a replaced plugin and lets its replacement provide its points', () => {
    const staticCsp = definePlugin({ name: 'static-csp', title: 'S', collects: { csp: CSP } })
    const myCsp = definePlugin({
      name: 'my-csp',
      title: 'M',
      replaces: 'static-csp',
      collects: { csp: CSP },
    })
    const analytics = definePlugin({ name: 'analytics', title: 'A', uses: { csp } })

    const resolved = resolve(staticCsp, analytics, myCsp)
    expect(resolved.plugins.map(({ plugin }) => plugin.name)).toEqual(['my-csp', 'analytics'])
    expect(resolved.providers.get('csp')).toBe('my-csp')
  })

  it('runs a replacement alone when the plugin it replaces is not selected', () => {
    const myCsp = definePlugin({ name: 'my-csp', title: 'M', replaces: 'static-csp' })

    expect(order(myCsp)).toEqual(['my-csp'])
  })

  it('refuses conflicting plugins with the reason, whichever of them states it', () => {
    const prettier = definePlugin({
      name: 'prettier',
      title: 'Prettier',
      conflicts: { biome: 'Biome formats the code itself.' },
    })
    const biome = definePlugin({ name: 'biome', title: 'Biome' })

    expect(() => order(prettier, biome)).toThrow(
      'prettier conflicts with biome: Biome formats the code itself.',
    )
    expect(() => order(biome, prettier)).toThrow(
      'prettier conflicts with biome: Biome formats the code itself.',
    )
  })

  it('ignores a conflict with a plugin that is replaced', () => {
    const prettier = definePlugin({
      name: 'prettier',
      title: 'P',
      conflicts: { biome: 'Formats.' },
    })
    const biome = definePlugin({ name: 'biome', title: 'B' })
    const oxfmt = definePlugin({ name: 'oxfmt', title: 'O', replaces: 'biome' })

    expect(order(prettier, biome, oxfmt)).toEqual(['prettier', 'oxfmt'])
  })
})
