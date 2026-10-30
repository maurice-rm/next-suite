import * as z from 'zod'

import { versionRangeSpec } from './version-spec.ts'

/** Dependencies by package name, each `catalog:<name>` or a semver range. */
export type Dependencies = Record<string, string>

export const dependenciesSchema = z.record(z.string().min(1), versionRangeSpec).meta({
  id: 'Dependencies',
  description: 'Dependencies by package name, each `catalog:<name>` or a semver range.',
})
