import { beforeEach, expect, test, vi } from "vitest";

import { installDependencies } from "../install";
import { run } from "../run";

vi.mock("../run");

beforeEach(() => {
  vi.clearAllMocks();
});

test("pnpm install uses plain install args (no version-specific flag)", async () => {
  await installDependencies("/tmp/x", "pnpm");
  expect(run).toHaveBeenCalledWith(
    "pnpm",
    ["install"],
    expect.objectContaining({ cwd: "/tmp/x" }),
  );
});

test("npm install uses plain install args", async () => {
  await installDependencies("/tmp/x", "npm");
  expect(run).toHaveBeenCalledWith(
    "npm",
    ["install"],
    expect.objectContaining({ cwd: "/tmp/x" }),
  );
});

test("yarn install enables first-install mode via env", async () => {
  await installDependencies("/tmp/x", "yarn");
  expect(run).toHaveBeenCalledWith(
    "yarn",
    ["install"],
    expect.objectContaining({
      env: {
        YARN_ENABLE_HARDENED_MODE: "0",
        YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
      },
    }),
  );
});
