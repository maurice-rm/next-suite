import { CodeEditError } from './code-edit-error.ts'
import type { JsxAttributeValue } from './jsx-attribute.ts'

/**
 * A component to wrap `{children}` of the root layout in. `inside` names another wrapper this one
 * goes inside of, whatever the order of the two.
 */
export type ChildrenWrapper = {
  component: string
  props?: Readonly<Record<string, JsxAttributeValue>>
  inside?: string
}

/**
 * Orders wrappers from outermost to innermost: in the given order, except that a wrapper waits
 * for the one it goes `inside` of.
 */
export const orderWrappers = (
  wrappers: readonly ChildrenWrapper[],
  path: string,
): ChildrenWrapper[] => {
  const pending = [...wrappers]
  const ordered: ChildrenWrapper[] = []
  while (pending.length > 0) {
    const index = pending.findIndex(
      ({ inside }) =>
        inside === undefined || !pending.some(({ component }) => component === inside),
    )
    const [next] = index === -1 ? [] : pending.splice(index, 1)
    if (next === undefined) {
      const components = pending.map(({ component }) => component).join(', ')
      throw new CodeEditError(`${path}: the wrappers ${components} each want to go inside another`)
    }
    ordered.push(next)
  }
  return ordered
}
