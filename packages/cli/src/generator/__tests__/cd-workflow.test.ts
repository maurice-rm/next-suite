import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { composeProject } from "../compose";
import { baseConfig } from "./scenarios";

const TEMPLATES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "templates",
);

const renderCd = async (): Promise<string> => {
  const files = await composeProject(
    {
      ...baseConfig,
      database: { engine: "postgres", orm: "drizzle" },
      production: { mode: "proxied" },
      githubActions: ["image", "deploy"],
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
