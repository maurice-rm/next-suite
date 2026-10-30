import semver from 'semver'

/** A package manager and the version of it that runs. */
export type PackageManagerVersion = { name: string; version: string }

/** Versions of a package manager that cannot install a generated project, with the way out. */
const UNSUPPORTED_VERSIONS: Readonly<Record<string, { range: string; hint: string }>> = {
  yarn: {
    range: '<2',
    hint: 'Yarn 1 is not supported; get Yarn 4 through Corepack: npm install -g corepack && corepack enable',
  },
}

/** Answers why a version of a package manager cannot be used, or nothing when it can. */
export const findUnsupportedVersion = ({
  name,
  version,
}: PackageManagerVersion): string | undefined => {
  const unsupported = UNSUPPORTED_VERSIONS[name]
  const isUnsupported =
    unsupported !== undefined && semver.satisfies(semver.coerce(version) ?? '', unsupported.range)
  return isUnsupported ? unsupported.hint : undefined
}
