import {
  findPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

/**
 * Detect the package manager the CLI was invoked with, via the
 * `npm_config_user_agent` env var (e.g. "pnpm/8.6.0 node/v20 linux x64").
 *
 * @returns The detected package manager, or `undefined` when it can't be
 *   determined.
 */
export const detectPackageManager = (): PackageManager | undefined => {
  const userAgent = process.env.npm_config_user_agent;
  if (!userAgent) return undefined;
  const name = userAgent.split("/")[0];
  return findPackageManagerEntry(name)?.id;
};
