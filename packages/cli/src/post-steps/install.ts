import {
  getPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

import { run } from "./run";

const installEnv = (
  packageManager: PackageManager,
): NodeJS.ProcessEnv | undefined =>
  getPackageManagerEntry(packageManager).installEnv;

/** Install with the per-manager env tweaks a lockfile-less first install needs. */
export const installDependencies = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await run(packageManager, ["install"], {
    cwd: targetDir,
    env: installEnv(packageManager),
  });
};
