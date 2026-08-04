import { expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { buildManifest, serializeManifest } from "../manifest";

const base: ProjectConfig = {
  projectName: "acme-app",
  targetDir: "/tmp/acme-app",
  action: "create",
  componentLibrary: "none",
  tailwind: false,
  auth: "none",
  email: "none",
  githubActions: [],
  git: false,
  packageManager: "npm",
  install: false,
};

test("buildManifest keeps only the feature-relevant subset", () => {
  expect(buildManifest(base)).toEqual({
    version: 1,
    name: "acme-app",
    packageManager: "npm",
    auth: "none",
    email: "none",
    githubActions: [],
  });
});

test("buildManifest includes optional blocks only when present", () => {
  const m = buildManifest({
    ...base,
    database: { engine: "postgres", orm: "drizzle" },
    api: { type: "orpc", openapi: { scalar: true } },
    production: { mode: "proxied" },
    githubActions: ["lint", "deploy"],
  });
  expect(m.database).toEqual({ engine: "postgres", orm: "drizzle" });
  expect(m.api).toEqual({ type: "orpc", openapi: { scalar: true } });
  expect(m.production).toEqual({ mode: "proxied" });
  expect("database" in buildManifest(base)).toBe(false);
});

test("serializeManifest is 2-space JSON with a trailing newline", () => {
  const out = serializeManifest(buildManifest(base));
  expect(out.endsWith("}\n")).toBe(true);
  expect(out).toContain('  "version": 1');
});
