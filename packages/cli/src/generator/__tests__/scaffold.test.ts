import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { scaffold } from "../scaffold";

// Decouple from the real feature registry + catalog: a single synthetic "base"
// layer renders through the full scaffold() pipeline. This tests the generator
// LOGIC (render → strip .hbs → RENAMES → merge package.json → write to disk),
// not the real template's content (that is covered end-to-end).
vi.mock("../resolve", () => ({
  activeFeatures: () => [{ dir: "base" }],
  dependenciesFragment: () => undefined,
  featureDependencies: () => [],
}));

let templates: string;
let target: string;
beforeEach(async () => {
  templates = await fs.mkdtemp(path.join(os.tmpdir(), "nc-scaffold-tpl-"));
  target = await fs.mkdtemp(path.join(os.tmpdir(), "nc-scaffold-out-"));
  await fs.outputFile(
    path.join(templates, "base", "package.json.hbs"),
    '{"name":"{{projectName}}"}',
  );
  await fs.outputFile(
    path.join(templates, "base", "src", "app", "page.tsx.hbs"),
    'export const app = "{{projectName}}";\n',
  );
  await fs.outputFile(
    path.join(templates, "base", "gitignore.hbs"),
    "node_modules\n",
  );
});
afterEach(async () => {
  await fs.remove(templates);
  await fs.remove(target);
});

const config = (targetDir: string): ProjectConfig => ({
  projectName: "synth-app",
  targetDir,
  action: "create",
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

test("scaffold renders the template and writes the project to disk", async () => {
  const out = path.join(target, "app");
  await scaffold(config(out), { templatesDir: templates });

  const page = await fs.readFile(
    path.join(out, "src", "app", "page.tsx"),
    "utf8",
  );
  expect(page).toContain("synth-app");
  expect(
    await fs.pathExists(path.join(out, "src", "app", "page.tsx.hbs")),
  ).toBe(false);

  const pkg = await fs.readJson(path.join(out, "package.json"));
  expect(pkg.name).toBe("synth-app");

  expect(await fs.pathExists(path.join(out, ".gitignore"))).toBe(true);
});
