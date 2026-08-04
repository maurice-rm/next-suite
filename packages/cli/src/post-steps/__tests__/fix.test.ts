import { beforeEach, expect, test, vi } from "vitest";

import { fixProject } from "../fix";
import { run } from "../run";

vi.mock("../run");

beforeEach(() => {
  vi.clearAllMocks();
});

test("fixProject runs the project's `fix` script", async () => {
  await fixProject("/tmp/x", "pnpm");
  expect(run).toHaveBeenCalledWith(
    "pnpm",
    ["run", "fix"],
    expect.objectContaining({ cwd: "/tmp/x" }),
  );
});
