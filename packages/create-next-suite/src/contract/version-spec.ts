import semver from 'semver'
import * as z from 'zod'

import { kebabCaseId } from './identifiers.ts'

const CATALOG_PREFIX = 'catalog:'

const isCatalogSpec = (spec: string): boolean =>
  spec.startsWith(CATALOG_PREFIX) &&
  kebabCaseId.safeParse(spec.slice(CATALOG_PREFIX.length)).success

/** A version range, or `catalog:<name>` for the version the catalog holds. */
export const versionRangeSpec = z
  .string()
  .refine(
    (spec) => isCatalogSpec(spec) || semver.validRange(spec) !== null,
    'Use `catalog:<name>` or a semver range',
  )

/** An exact version, or `catalog:<name>` for the version the catalog holds. */
export const exactVersionSpec = z
  .string()
  .refine(
    (spec) => isCatalogSpec(spec) || semver.valid(spec) !== null,
    'Use `catalog:<name>` or an exact version',
  )
