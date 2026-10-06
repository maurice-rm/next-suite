import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { prepareTarget } from "../prepare-target";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nc-prepare-target-"));
});
afterEach(async () => {
  await fs.remove(directory);
});

test('"create" ensures the directory exists', async () => {
  const target = path.join(directory, "fresh");
  await prepareTarget(target, "create");
  expect(await fs.pathExists(target)).toBe(true);
});

test('"overwrite" keeps existing files', async () => {
  await fs.writeFile(path.join(directory, "keep.txt"), "x");
  await prepareTarget(directory, "overwrite");
  expect(await fs.pathExists(path.join(directory, "keep.txt"))).toBe(true);
});

test('"empty" removes everything except .git', async () => {
  await fs.outputFile(path.join(directory, ".git", "HEAD"), "ref");
  await fs.writeFile(path.join(directory, "old.txt"), "x");
  await prepareTarget(directory, "empty");
  expect(await fs.pathExists(path.join(directory, ".git"))).toBe(true);
  expect(await fs.pathExists(path.join(directory, "old.txt"))).toBe(false);
});

test('"empty" refuses an unsafe target (throws before deleting anything)', async () => {
  await expect(
    prepareTarget(path.dirname(process.cwd()), "empty"),
  ).rejects.toThrow(/Refusing to empty/);
});
