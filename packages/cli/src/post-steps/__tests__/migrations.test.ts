import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { generateMigrations } from "../migrations";
import { run } from "../run";

vi.mock("../run");

let targetDir: string;
beforeEach(async () => {
  vi.clearAllMocks();
  targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "ns-migrations-"));
});
afterEach(async () => {
  await fs.remove(targetDir);
});

const PRISMA_DIFF_ARGS = [
  "prisma",
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema",
  "prisma",
  "--script",
  "--output",
  "prisma/migrations/0_init/migration.sql",
];

test("generateMigrations runs drizzle-kit through the db:generate script", async () => {
  await generateMigrations(targetDir, "pnpm", "drizzle");
  expect(run).toHaveBeenCalledWith("pnpm", ["run", "db:generate"], {
    cwd: targetDir,
  });
});

test.each([
  ["npm", "npx", ["--no", "--"]],
  ["pnpm", "pnpm", ["exec"]],
  ["yarn", "yarn", ["exec"]],
  ["bun", "bunx", []],
] as const)(
  "generateMigrations diffs the Prisma schema into 0_init with %s",
  async (packageManager, command, prefix) => {
    await generateMigrations(targetDir, packageManager, "prisma");
    expect(run).toHaveBeenCalledWith(
      command,
      [...prefix, ...PRISMA_DIFF_ARGS],
      { cwd: targetDir },
    );
    expect(
      await fs.pathExists(path.join(targetDir, "prisma/migrations/0_init")),
    ).toBe(true);
  },
);
