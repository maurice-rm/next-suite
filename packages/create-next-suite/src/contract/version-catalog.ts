import * as z from 'zod'

/** The versions dependencies and package managers resolve `catalog:<name>` to. */
export const versionCatalogSchema = z.record(z.string(), z.string())

/** The versions dependencies and package managers resolve `catalog:<name>` to. */
export type VersionCatalog = Readonly<z.output<typeof versionCatalogSchema>>
