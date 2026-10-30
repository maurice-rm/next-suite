import { describe, expectTypeOf, it } from 'vitest'
import type * as z from 'zod'

import type { categoriesSchema } from './contract/category.ts'
import type { conditionSchema } from './contract/condition.ts'
import type { contributionsSchema } from './contract/contributions.ts'
import type { logicResultSchema } from './contract/logic.ts'
import type { pluginManifestSchema } from './contract/plugin-manifest.ts'
import type { pluginOptionSchema } from './contract/plugin-option.ts'
import type {
  CategoriesFile,
  Condition,
  Contributions,
  Logic,
  LogicResult,
  PluginManifest,
  PluginOption,
} from './plugin.ts'

/** Flattens intersections such as zod's `X & {}`, so identical shapes compare as equal. */
type Normalized<Type> = Type extends readonly (infer Item)[]
  ? Normalized<Item>[]
  : Type extends object
    ? { [Key in keyof Type]: Normalized<Type[Key]> }
    : Type

const MINIMAL = {
  name: 'acme-auth',
  version: '1.0.0',
  contract: '^1.0.0',
  title: 'Acme Auth',
  description: 'Sign-in through Acme.',
}

describe('the public types', () => {
  it('equal what the schemas accept', () => {
    expectTypeOf<Normalized<PluginManifest>>().toEqualTypeOf<
      Normalized<z.input<typeof pluginManifestSchema>>
    >()
    expectTypeOf<Normalized<PluginOption>>().toEqualTypeOf<
      Normalized<z.input<typeof pluginOptionSchema>>
    >()
    expectTypeOf<Normalized<Condition>>().toEqualTypeOf<
      Normalized<z.input<typeof conditionSchema>>
    >()
    expectTypeOf<Normalized<Contributions>>().toEqualTypeOf<
      Normalized<z.input<typeof contributionsSchema>>
    >()
    expectTypeOf<Normalized<LogicResult>>().toEqualTypeOf<
      Normalized<z.input<typeof logicResultSchema>>
    >()
    expectTypeOf<Normalized<CategoriesFile>>().toEqualTypeOf<
      Normalized<z.input<typeof categoriesSchema>>
    >()
  })
})

describe('PluginManifest', () => {
  it('accepts a file without a conflict strategy, since the strategy has a default', () => {
    const manifest = { ...MINIMAL, files: [{ source: 'files/auth.ts', target: 'lib/auth.ts' }] }

    expectTypeOf(manifest).toExtend<PluginManifest>()
  })

  it('rejects an unknown conflict strategy', () => {
    const file = { source: 'a', target: 'b', conflict: 'merge' as const }

    expectTypeOf({ ...MINIMAL, files: [file] }).not.toExtend<PluginManifest>()
  })
})

describe('Condition', () => {
  it('nests conditions in all, any and not', () => {
    const condition = { all: [{ plugin: 'drizzle' }, { not: { any: [{ category: 'api' }] } }] }

    expectTypeOf(condition).toExtend<Condition>()
  })

  it('rejects a condition kind that does not exist', () => {
    expectTypeOf({ unless: { plugin: 'drizzle' } }).not.toExtend<Condition>()
  })
})

describe('Logic', () => {
  it('computes files from the context, synchronously or not', () => {
    const logic: Logic = async (context) => ({
      files: [
        { target: 'lib/name.ts', content: `export const name = '${context.project.name}'\n` },
      ],
      contributes: { gitignore: context.has('plugin:prettier') ? ['/cache'] : [] },
    })

    expectTypeOf(logic).toExtend<Logic>()
  })

  it('rejects a file without content', () => {
    const logic = () => ({ files: [{ target: 'a.ts' }] })

    expectTypeOf(logic).not.toExtend<Logic>()
  })
})
