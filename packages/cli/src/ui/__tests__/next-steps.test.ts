import { describe, expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { nextSteps } from "../next-steps";

const config = (overrides: Partial<ProjectConfig>): ProjectConfig => ({
  projectName: "app",
  targetDir: "/tmp/app",
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
  ...overrides,
});

describe("nextSteps", () => {
  test("includes the install step when dependencies were not installed", () => {
    expect(
      nextSteps(config({ packageManager: "pnpm", install: false })),
    ).toEqual(["cd app", "pnpm install", "pnpm run dev"]);
  });

  test("omits the install step when dependencies were already installed", () => {
    expect(nextSteps(config({ packageManager: "bun", install: true }))).toEqual(
      ["cd app", "bun run dev"],
    );
  });

  test("adds the database steps when a database was selected", () => {
    expect(
      nextSteps(
        config({
          packageManager: "pnpm",
          install: true,
          database: { engine: "postgres", orm: "drizzle" },
        }),
      ),
    ).toEqual([
      "cd app",
      "docker compose up -d",
      "pnpm run db:push",
      "pnpm run dev",
    ]);
  });
});
