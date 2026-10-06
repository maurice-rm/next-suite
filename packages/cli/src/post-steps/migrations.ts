import path from "node:path";

import fs from "fs-extra";

import type { Orm } from "@/core/types";
import {
  getPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

import { run } from "./run";

const PRISMA_INITIAL_MIGRATION = "prisma/migrations/0_init/migration.sql";

const generateDrizzleMigration = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await run(packageManager, ["run", "db:generate"], { cwd: targetDir });
};

const generatePrismaMigration = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await fs.ensureDir(
    path.join(targetDir, path.dirname(PRISMA_INITIAL_MIGRATION)),
  );
  const [command, ...prefix] =
    getPackageManagerEntry(packageManager).exec.split(" ");
  await run(
    command ?? packageManager,
    [
      ...prefix,
      "prisma",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma",
      "--script",
      "--output",
      PRISMA_INITIAL_MIGRATION,
    ],
    { cwd: targetDir },
  );
};

const MIGRATION_GENERATORS: Record<
  Orm,
  (targetDir: string, packageManager: PackageManager) => Promise<void>
> = { drizzle: generateDrizzleMigration, prisma: generatePrismaMigration };

/**
 * Generate the initial migration from the schema, so a production project
 * ships with one for the entrypoint to apply. Offline: neither ORM needs a
 * database to diff the schema against an empty one.
 */
export const generateMigrations = async (
  targetDir: string,
  packageManager: PackageManager,
  orm: Orm,
): Promise<void> => {
  await MIGRATION_GENERATORS[orm](targetDir, packageManager);
};
