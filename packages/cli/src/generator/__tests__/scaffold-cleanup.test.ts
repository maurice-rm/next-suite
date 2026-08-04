import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { scaffold } from "../scaffold";
import { writeFileMap } from "../write";

// Force a failure in the WRITE phase (after compose + prepareTarget succeed), so
// the createdFresh cleanup branch is actually exercised.
vi.mock("../write");

const REPO_TEMPLATES = fileURLToPath(
  new URL("../../../templates", import.meta.url),
);

const config = (
  targetDir: string,
  action: ProjectConfig["action"],
): ProjectConfig => ({
  projectName: "app",
  targetDir,
  action,
  componentLibrary: "none",
  tailwind: false,
  api: undefined,
  auth: "none",
  email: "none",
  git: false,
  packageManager: "npm",
  install: false,
  githubActions: [],
});

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "nc-cleanup-"));
});
afterEach(async () => {
  await fs.remove(root);
  vi.clearAllMocks();
});

test("removes a freshly created directory when writing fails", async () => {
  vi.mocked(writeFileMap).mockRejectedValueOnce(new Error("write failed"));
  const target = path.join(root, "fresh");
  await expect(
    scaffold(config(target, "create"), { templatesDir: REPO_TEMPLATES }),
  ).rejects.toThrow();
  expect(await fs.pathExists(target)).toBe(false);
});

test("keeps a pre-existing directory and its files when writing fails", async () => {
  vi.mocked(writeFileMap).mockRejectedValueOnce(new Error("write failed"));
  const target = path.join(root, "existing");
  await fs.outputFile(path.join(target, "keep.txt"), "user data");
  await expect(
    scaffold(config(target, "overwrite"), { templatesDir: REPO_TEMPLATES }),
  ).rejects.toThrow();
  expect(await fs.readFile(path.join(target, "keep.txt"), "utf8")).toBe(
    "user data",
  );
});

// "overwrite"/"empty" normally imply a pre-existing directory (enforced in the
// prompts), but if one is run against a not-yet-existing target the directory we
// just created must still be cleaned up — cleanup keys off pre-existence, not
// the action.
test.each(["overwrite", "empty"] as const)(
  'removes a freshly created "%s" target when writing fails',
  async (action) => {
    vi.mocked(writeFileMap).mockRejectedValueOnce(new Error("write failed"));
    const target = path.join(root, "fresh");
    await expect(
      scaffold(config(target, action), { templatesDir: REPO_TEMPLATES }),
    ).rejects.toThrow();
    expect(await fs.pathExists(target)).toBe(false);
  },
);
