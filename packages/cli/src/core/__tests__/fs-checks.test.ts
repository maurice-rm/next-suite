import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { hasConflictingFiles, isExistingFile } from "../fs-checks";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-checks-"));
});

afterEach(async () => {
  await fs.remove(dir);
});

test("hasConflictingFiles: an empty directory is conflict-free", async () => {
  expect(await hasConflictingFiles(dir)).toBe(false);
});

test("hasConflictingFiles: a missing directory is conflict-free", async () => {
  expect(await hasConflictingFiles(path.join(dir, "nope"))).toBe(false);
});

test("hasConflictingFiles: only benign entries is conflict-free", async () => {
  await fs.ensureDir(path.join(dir, ".git"));
  await fs.writeFile(path.join(dir, "LICENSE"), "x");
  await fs.writeFile(path.join(dir, ".gitignore"), "x");
  await fs.writeFile(path.join(dir, "project.iml"), "x");
  expect(await hasConflictingFiles(dir)).toBe(false);
});

test("hasConflictingFiles: a non-benign file counts as a conflict", async () => {
  await fs.writeFile(path.join(dir, "package.json"), "{}");
  expect(await hasConflictingFiles(dir)).toBe(true);
});

test("hasConflictingFiles: a plain file path (not a directory) is conflict-free", async () => {
  const file = path.join(dir, "afile");
  await fs.writeFile(file, "x");
  expect(await hasConflictingFiles(file)).toBe(false);
});

test("isExistingFile: true for a file, false for a directory or a missing path", async () => {
  const file = path.join(dir, "afile");
  await fs.writeFile(file, "x");
  expect(isExistingFile(file)).toBe(true);
  expect(isExistingFile(dir)).toBe(false);
  expect(isExistingFile(path.join(dir, "missing"))).toBe(false);
});
