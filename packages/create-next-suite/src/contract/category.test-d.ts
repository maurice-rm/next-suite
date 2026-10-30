import { describe, expectTypeOf, it } from 'vitest'
import type * as z from 'zod'

import type { Category, categoriesSchema } from './category.ts'

/** Flattens intersections such as zod's `X & {}`, so identical shapes compare as equal. */
type Normalized<Type> = Type extends readonly (infer Item)[]
  ? Normalized<Item>[]
  : Type extends object
    ? { [Key in keyof Type]: Normalized<Type[Key]> }
    : Type

describe('Category', () => {
  it('equals what parsing the categories file gives for a category', () => {
    expectTypeOf<Normalized<Category>>().toEqualTypeOf<
      Normalized<z.output<typeof categoriesSchema>[number]>
    >()
  })
})
