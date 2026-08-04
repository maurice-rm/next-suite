import {
  getPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

import { run } from "./run";

const installEnv = (
  packageManager: PackageManager,
): NodeJS.ProcessEnv | undefined =>
  getPackageManagerEntry(packageManager).installEnv;

/**
 * Install dependencies with the chosen package manager, applying the per-manager
 * tweaks a fresh scaffold needs.
 *
 * @param targetDir - The generated project directory.
 * @param packageManager - The package manager to install with.
 */
export const installDependencies = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await run(packageManager, ["install"], {
    cwd: targetDir,
    env: installEnv(packageManager),
  });
};
