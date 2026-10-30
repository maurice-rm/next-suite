import type { Category } from '../contract/category.ts'
import { PACKAGE_MANAGER_CATEGORY } from '../contract/plugin-manifest.ts'

/** Makes a package manager the default of the package manager question; nothing keeps it. */
export const preferPackageManager = (
  categories: readonly Category[],
  packageManager: string | undefined,
): Category[] =>
  categories.map((category) =>
    packageManager !== undefined &&
    category.id === PACKAGE_MANAGER_CATEGORY &&
    category.cardinality === 'one'
      ? { ...category, default: packageManager }
      : category,
  )
