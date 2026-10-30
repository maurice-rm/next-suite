import type { VersionCatalog } from '../contract/version-catalog.ts'
import { ComposeError } from './compose-error.ts'

const CATALOG_PREFIX = 'catalog:'

/** Resolves a `catalog:<name>` version from the catalog; any other version stays as it is. */
export const resolveVersion = (spec: string, catalog: VersionCatalog, origin: string): string => {
  if (!spec.startsWith(CATALOG_PREFIX)) {
    return spec
  }
  const version = catalog[spec.slice(CATALOG_PREFIX.length)]
  if (version === undefined) {
    throw new ComposeError(`${origin} asks for ${spec}, which the version catalog does not list`)
  }
  return version
}
