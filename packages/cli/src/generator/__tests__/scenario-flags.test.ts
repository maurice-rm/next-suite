import { expect, test } from "vitest";

import { baseConfig, scenarioToFlags } from "./scenarios";

test("a minimal config maps to package manager + --no-git", () => {
  expect(scenarioToFlags(baseConfig)).toEqual(["--pm", "npm", "--no-git"]);
});

test("Tailwind without shadcn adds --tailwind", () => {
  expect(scenarioToFlags({ ...baseConfig, tailwind: true })).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--tailwind",
  ]);
});

test("shadcn emits base/preset/pointer and implies Tailwind", () => {
  expect(
    scenarioToFlags({
      ...baseConfig,
      packageManager: "pnpm",
      componentLibrary: "shadcn",
      tailwind: true,
      shadcn: { base: "radix", pointer: true, preset: "b0" },
    }),
  ).toEqual([
    "--pm",
    "pnpm",
    "--no-git",
    "--shadcn",
    "--shadcn-base",
    "radix",
    "--shadcn-preset",
    "b0",
    "--shadcn-pointer",
  ]);
});

test("shadcn omits preset/pointer when unset", () => {
  expect(
    scenarioToFlags({
      ...baseConfig,
      packageManager: "yarn",
      componentLibrary: "shadcn",
      tailwind: true,
      shadcn: { base: "base", pointer: false },
    }),
  ).toEqual(["--pm", "yarn", "--no-git", "--shadcn", "--shadcn-base", "base"]);
});

test("a database emits --database and --orm", () => {
  expect(
    scenarioToFlags({
      ...baseConfig,
      database: { engine: "mysql", orm: "drizzle" },
    }),
  ).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--database",
    "mysql",
    "--orm",
    "drizzle",
  ]);
});

test("an api type emits --api", () => {
  expect(scenarioToFlags({ ...baseConfig, api: { type: "trpc" } })).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--api",
    "trpc",
  ]);
});

test("an auth provider emits --auth", () => {
  expect(
    scenarioToFlags({
      ...baseConfig,
      database: { engine: "postgres", orm: "drizzle" },
      auth: "better-auth",
    }),
  ).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--database",
    "postgres",
    "--orm",
    "drizzle",
    "--auth",
    "better-auth",
  ]);
});

test("an email provider emits --email", () => {
  expect(scenarioToFlags({ ...baseConfig, email: "resend" })).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--email",
    "resend",
  ]);
});

test("a production config emits --deployment", () => {
  expect(
    scenarioToFlags({ ...baseConfig, production: { mode: "standalone" } }),
  ).toEqual(["--pm", "npm", "--no-git", "--deployment", "standalone"]);
});

test("selected github-actions steps emit a comma-separated --github-actions", () => {
  expect(
    scenarioToFlags({
      ...baseConfig,
      githubActions: ["lint", "typecheck", "build"],
    }),
  ).toEqual([
    "--pm",
    "npm",
    "--no-git",
    "--github-actions",
    "lint,typecheck,build",
  ]);
});
