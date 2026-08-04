import { expect, test } from "vitest";

import { isCommandAvailable, run } from "../run";

test("isCommandAvailable is true for a present command", async () => {
  expect(await isCommandAvailable("node")).toBe(true);
});

test("isCommandAvailable is false for a missing command", async () => {
  expect(await isCommandAvailable("definitely-not-a-real-command-xyz")).toBe(
    false,
  );
});

test("run resolves for a command that exits within the timeout", async () => {
  await expect(
    run("node", ["-e", ""], { cwd: process.cwd() }),
  ).resolves.toBeUndefined();
});

test("run rejects when a command exceeds its timeout", async () => {
  await expect(
    run("node", ["-e", "setTimeout(() => {}, 10000)"], {
      cwd: process.cwd(),
      timeout: 100,
    }),
  ).rejects.toThrow();
});
