import * as z from 'zod'

/** Marks `allowedBuildsIn` values that name a field of package.json, such as `package.json#allowScripts`. */
export const PACKAGE_JSON_FIELD_PREFIX = 'package.json#'

/** The package.json fields a package manager reads its allowed dependency builds from. */
export const PACKAGE_JSON_BUILD_FIELDS: readonly string[] = [
  'allowScripts',
  'dependenciesMeta',
  'trustedDependencies',
]

const isValidAllowedBuildsLocation = (location: string): boolean =>
  !location.startsWith(PACKAGE_JSON_FIELD_PREFIX) ||
  PACKAGE_JSON_BUILD_FIELDS.includes(location.slice(PACKAGE_JSON_FIELD_PREFIX.length))

const locations = PACKAGE_JSON_BUILD_FIELDS.map((field) => `${PACKAGE_JSON_FIELD_PREFIX}${field}`)
const locationList = `${locations.slice(0, -1).join(', ')} or ${locations.at(-1)}`

/** Where a package manager reads the allowed builds: a package.json build field or a file. */
export const allowedBuildsLocationSchema = z
  .string()
  .min(1)
  .refine(isValidAllowedBuildsLocation, `Use ${locationList}`)
