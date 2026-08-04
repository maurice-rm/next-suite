import type { PackageManager } from "@/package-managers";

import { run } from "./run";

/**
 * Generate the initial Drizzle migration, so a production project ships with a
 * `drizzle/meta/_journal.json` for the entrypoint to apply. Offline: the config
 * reads credentials from `process.env`, so no database is needed.
 *
 * @param targetDir - The generated project directory.
 * @param packageManager - The package manager whose `run` executes the script.
 */
export const generateMigrations = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await run(packageManager, ["run", "db:generate"], { cwd: targetDir });
};
