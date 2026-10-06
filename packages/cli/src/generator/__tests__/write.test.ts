import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { writeFileMap } from "../write";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nc-write-"));
});
afterEach(async () => {
  await fs.remove(directory);
});

test("writes nested files, creating parent directories", async () => {
  await writeFileMap(
    directory,
    new Map([
      ["app/page.tsx", "x"],
      ["package.json", "{}"],
    ]),
  );
  expect(
    await fs.readFile(path.join(directory, "app", "page.tsx"), "utf8"),
  ).toBe("x");
  expect(await fs.readFile(path.join(directory, "package.json"), "utf8")).toBe(
    "{}",
  );
});
