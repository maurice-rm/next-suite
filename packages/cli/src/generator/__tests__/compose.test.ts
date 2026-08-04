import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { composeProject } from "../compose";

vi.mock("../resolve", () => ({
  activeFeatures: () => [{ dir: "base" }, { dir: "feature" }],
  dependenciesFragment: () => undefined,
  featureDependencies: () => [],
}));

let templates: string;
beforeEach(async () => {
  templates = await fs.mkdtemp(path.join(os.tmpdir(), "nc-compose-"));
});
afterEach(async () => {
  await fs.remove(templates);
});

test("later layers overwrite normal files; package.json fragments merge", async () => {
  await fs.outputFile(path.join(templates, "base", "app", "page.tsx"), "base");
  await fs.outputFile(
    path.join(templates, "base", "package.json"),
    '{"name":"app","dependencies":{"next":"^15"}}',
  );
  await fs.outputFile(
    path.join(templates, "feature", "app", "page.tsx"),
    "feature",
  );
  await fs.outputFile(
    path.join(templates, "feature", "package.json"),
    '{"dependencies":{"better-auth":"^1"}}',
  );

  const fileMap = await composeProject({} as ProjectConfig, templates);

  expect(fileMap.get("app/page.tsx")).toBe("feature");
  const pkg = JSON.parse(fileMap.get("package.json") as string);
  expect(pkg.name).toBe("app");
  expect(Object.keys(pkg.dependencies)).toEqual(["better-auth", "next"]);
});

test("binary files pass through the pipeline uncorrupted", async () => {
  const bytes = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  await fs.outputFile(path.join(templates, "base", "icon.png"), bytes);
  await fs.ensureDir(path.join(templates, "feature"));

  const fileMap = await composeProject({} as ProjectConfig, templates);

  expect(fileMap.get("icon.png")).toEqual(bytes);
});

test("throws when composition produces no files", async () => {
  await fs.ensureDir(path.join(templates, "base"));
  await fs.ensureDir(path.join(templates, "feature"));
  await expect(composeProject({} as ProjectConfig, templates)).rejects.toThrow(
    /no files/,
  );
});

test("includes next-suite.json manifest when composition succeeds", async () => {
  await fs.outputFile(path.join(templates, "base", "app", "page.tsx"), "x");
  await fs.ensureDir(path.join(templates, "feature"));

  const fileMap = await composeProject({} as ProjectConfig, templates);

  expect(fileMap.has("next-suite.json")).toBe(true);
  const manifest = JSON.parse(fileMap.get("next-suite.json") as string);
  expect(manifest.version).toBe(1);
});

test("a merged .env.example is mirrored into a real .env", async () => {
  await fs.outputFile(path.join(templates, "base", "app", "page.tsx"), "x");
  await fs.outputFile(
    path.join(templates, "feature", ".env.example"),
    "DATABASE_URL=postgresql://localhost:5432/app\n",
  );

  const fileMap = await composeProject({} as ProjectConfig, templates);

  expect(fileMap.get(".env")).toBe(
    "DATABASE_URL=postgresql://localhost:5432/app\n",
  );
});
