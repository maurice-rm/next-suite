import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { composeProject } from "../compose";
import { baseConfig } from "./scenarios";

const TEMPLATES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "templates",
);

const renderCi = async (overrides: Partial<ProjectConfig>): Promise<string> => {
  const files = await composeProject(
    { ...baseConfig, githubActions: ["build"], ...overrides },
    TEMPLATES,
  );
  const ci = files.get(".github/workflows/ci.yml");
  if (typeof ci !== "string") throw new Error("ci.yml was not generated");
  return ci;
};

test("the build step is guarded on NEXT_PUBLIC_APP_URL when the URL is baked in", async () => {
  const ci = await renderCi({ auth: "better-auth" });

  expect(ci).toContain("Require NEXT_PUBLIC_APP_URL");
  expect(ci).toMatch(/Require NEXT_PUBLIC_APP_URL[\s\S]*name: Build/);
});

test("the build step is unguarded when nothing needs the URL at build time", async () => {
  expect(await renderCi({})).not.toContain("NEXT_PUBLIC_APP_URL");
});
