import { describe, expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { buildSummary } from "../outro";

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

describe("buildSummary", () => {
  test("reflects the chosen features — Tailwind and shadcn/ui", () => {
    const summary = buildSummary(
      config({
        tailwind: true,
        componentLibrary: "shadcn",
        shadcn: { base: "radix", pointer: false },
      }),
    );
    expect(summary.stack).toEqual([
      "Next.js",
      "TypeScript",
      "Tailwind",
      "shadcn/ui",
    ]);
  });

  test("reads every selection, labelled from options.ts", () => {
    const summary = buildSummary(
      config({
        database: { engine: "postgres", orm: "drizzle" },
        api: { type: "trpc" },
        auth: "better-auth",
        email: "resend",
      }),
    );
    expect(summary.stack).toEqual([
      "Next.js",
      "TypeScript",
      "PostgreSQL",
      "Drizzle",
      "tRPC",
      "Better-Auth",
      "Resend",
    ]);
  });

  test("a bare config is just Next.js + TypeScript", () => {
    expect(buildSummary(config({})).stack).toEqual(["Next.js", "TypeScript"]);
  });

  test("carries the package manager and next-step commands", () => {
    const summary = buildSummary(
      config({ packageManager: "pnpm", install: true }),
    );
    expect(summary).toMatchObject({
      packageManager: "pnpm",
      steps: ["cd app", "pnpm run dev"],
    });
  });

  test("shows nginx and CI/CD chips when set", () => {
    const summary = buildSummary(
      config({
        production: { mode: "standalone" },
        githubActions: ["image", "deploy"],
      }),
    );
    expect(summary.stack).toEqual(["Next.js", "TypeScript", "nginx", "CI/CD"]);
  });
});
