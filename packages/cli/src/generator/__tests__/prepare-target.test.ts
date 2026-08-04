import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { prepareTarget } from "../prepare-target";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nc-prepare-target-"));
});
afterEach(async () => {
  await fs.remove(dir);
});

test('"create" ensures the directory exists', async () => {
  const target = path.join(dir, "fresh");
  await prepareTarget(target, "create");
  expect(await fs.pathExists(target)).toBe(true);
});

test('"overwrite" keeps existing files', async () => {
  await fs.writeFile(path.join(dir, "keep.txt"), "x");
  await prepareTarget(dir, "overwrite");
  expect(await fs.pathExists(path.join(dir, "keep.txt"))).toBe(true);
});

test('"empty" removes everything except .git', async () => {
  await fs.outputFile(path.join(dir, ".git", "HEAD"), "ref");
  await fs.writeFile(path.join(dir, "old.txt"), "x");
  await prepareTarget(dir, "empty");
  expect(await fs.pathExists(path.join(dir, ".git"))).toBe(true);
  expect(await fs.pathExists(path.join(dir, "old.txt"))).toBe(false);
});

test('"empty" refuses an unsafe target (throws before deleting anything)', async () => {
  await expect(
    prepareTarget(path.dirname(process.cwd()), "empty"),
  ).rejects.toThrow(/Refusing to empty/);
});
