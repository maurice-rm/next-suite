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

const renderCd = async (
  githubActions: ProjectConfig["githubActions"] = ["image", "deploy"],
): Promise<string> => {
  const files = await composeProject(
    {
      ...baseConfig,
      database: { engine: "postgres", orm: "drizzle" },
      production: { mode: "proxied" },
      githubActions,
    },
    TEMPLATES,
  );
  const cd = files.get(".github/workflows/cd.yml");
  if (typeof cd !== "string") throw new Error("cd.yml was not generated");
  return cd;
};

test("every `compose run` in the deploy reads from /dev/null", async () => {
  const runs = (await renderCd())
    .split("\n")
    .filter((l) => /docker compose .*\brun\b/.test(l));

  expect(runs.length).toBeGreaterThan(0);
  for (const line of runs) expect(line).toMatch(/<\s*\/dev\/null/);
});

test("the image job is gated on the CI workflow when CI steps are selected", async () => {
  const cd = await renderCd(["lint", "image", "deploy"]);

  expect(cd).toContain("uses: ./.github/workflows/ci.yml");
  expect(cd).toMatch(/ {2}image:\n {4}needs: ci\n/);
});

test("the image job has no CI gate when no CI steps are selected", async () => {
  const cd = await renderCd(["image", "deploy"]);

  expect(cd).not.toContain("ci.yml");
  expect(cd).not.toContain("needs: ci");
});
