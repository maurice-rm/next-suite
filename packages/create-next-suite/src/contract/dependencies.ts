import * as z from 'zod'

import { versionRangeSpec } from './version-spec.ts'

/** Dependencies of the project by package name, each `catalog:<name>` or a semver range. */
export const dependenciesSchema = z.record(z.string().min(1), versionRangeSpec)
