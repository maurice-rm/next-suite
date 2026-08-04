import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { writeFileMap } from "../write";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nc-write-"));
});
afterEach(async () => {
  await fs.remove(dir);
});

test("writes nested files, creating parent directories", async () => {
  await writeFileMap(
    dir,
    new Map([
      ["app/page.tsx", "x"],
      ["package.json", "{}"],
    ]),
  );
  expect(await fs.readFile(path.join(dir, "app", "page.tsx"), "utf8")).toBe(
    "x",
  );
  expect(await fs.readFile(path.join(dir, "package.json"), "utf8")).toBe("{}");
});
