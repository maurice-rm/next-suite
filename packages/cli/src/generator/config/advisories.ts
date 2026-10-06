/** A dependency advisory every generated project accepts, with the reason. */
interface AcceptedAdvisory {
  id: `GHSA-${string}`;
  /** The npm registry's numeric ID, which Yarn reports and ignores by. */
  npmAdvisoryId: number;
  dependency: string;
  reason: string;
}

/**
 * Advisories the generated projects' dependency audit ignores: each has no
 * patched release the upstream accepts, and reaches only build or lint tooling.
 * A fixable advisory gets a feature `overrides` entry instead. Review this list
 * whenever a version in `VERSIONS` changes.
 */
export const ACCEPTED_ADVISORIES: AcceptedAdvisory[] = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    npmAdvisoryId: 1240992,
    dependency: "braces",
    reason:
      "No patched version exists; reached only through the glob matching of lint and build tooling.",
  },
  {
    id: "GHSA-67mh-4wv8-2f99",
    npmAdvisoryId: 1102341,
    dependency: "esbuild",
    reason:
      "A development-server issue in the esbuild copy drizzle-kit loads its config with; that server never runs.",
  },
  {
    id: "GHSA-ggr8-5vv4-36mx",
    npmAdvisoryId: 1145093,
    dependency: "deepmerge-ts",
    reason:
      "Reached only through the Prisma CLI's config loader; the patched release is a major version Prisma does not accept yet.",
  },
];
