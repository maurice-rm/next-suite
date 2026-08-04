import { beforeEach, expect, test, vi } from "vitest";

import type { ShadcnOptions } from "@/core/types";

import { run } from "../run";
import { initShadcn } from "../shadcn";

vi.mock("../run");

beforeEach(() => {
  vi.clearAllMocks();
});

const options = (over: Partial<ShadcnOptions> = {}): ShadcnOptions => ({
  base: "radix",
  pointer: false,
  ...over,
});

test("runs shadcn via npx and defaults an empty preset to the blank `b0`", async () => {
  await initShadcn("/tmp/x", "npm", options());
  expect(run).toHaveBeenCalledWith(
    "npx",
    [
      "shadcn@latest",
      "init",
      "--template",
      "next",
      "--base",
      "radix",
      "--no-pointer",
      "--preset",
      "b0",
      "--yes",
    ],
    { cwd: "/tmp/x" },
  );
});

test("a blank/whitespace preset still falls back to `b0`", async () => {
  await initShadcn("/tmp/x", "npm", options({ preset: "   " }));
  const args = vi.mocked(run).mock.calls[0]?.[1] ?? [];
  expect(args).toContain("--preset");
  expect(args[args.indexOf("--preset") + 1]).toBe("b0");
});

test("uses the pnpm dlx runner and includes pointer + preset", async () => {
  await initShadcn(
    "/tmp/x",
    "pnpm",
    options({ base: "base", pointer: true, preset: "b27GcrRo" }),
  );
  expect(run).toHaveBeenCalledWith(
    "pnpm",
    [
      "dlx",
      "shadcn@latest",
      "init",
      "--template",
      "next",
      "--base",
      "base",
      "--pointer",
      "--preset",
      "b27GcrRo",
      "--yes",
    ],
    { cwd: "/tmp/x" },
  );
});
