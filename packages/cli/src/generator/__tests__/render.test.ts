import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { afterEach, beforeEach, expect, test } from "vitest";

import { type FileMap, type Fragments, renderLayer } from "../render";

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "nc-render-"));
});
afterEach(async () => {
  await fs.remove(dir);
});

const sinks = (): { fileMap: FileMap; fragments: Fragments } => ({
  fileMap: new Map(),
  fragments: new Map(),
});

test("renders .hbs into the file map under its relative path", async () => {
  await fs.outputFile(
    path.join(dir, "app", "page.tsx.hbs"),
    'export const n = "{{projectName}}";',
  );
  const { fileMap, fragments } = sinks();
  await renderLayer(dir, { projectName: "demo" }, fileMap, fragments);
  expect(fileMap.get("app/page.tsx")).toBe('export const n = "demo";');
});

test("copies non-template files verbatim", async () => {
  await fs.outputFile(path.join(dir, "static.txt"), "raw");
  const { fileMap, fragments } = sinks();
  await renderLayer(dir, {}, fileMap, fragments);
  expect(fileMap.get("static.txt")).toBe("raw");
});

test("routes package.json and .env.example to fragments, not the map", async () => {
  await fs.outputFile(path.join(dir, "package.json"), '{"name":"x"}');
  await fs.outputFile(path.join(dir, ".env.example"), "A=1");
  const { fileMap, fragments } = sinks();
  await renderLayer(dir, {}, fileMap, fragments);
  expect(fileMap.size).toBe(0);
  expect(fragments.get("package.json")).toEqual(['{"name":"x"}']);
  expect(fragments.get(".env.example")).toEqual(["A=1"]);
});

test("does not hoist a nested package.json into fragments", async () => {
  await fs.outputFile(
    path.join(dir, "apps", "web", "package.json"),
    '{"name":"web"}',
  );
  const { fileMap, fragments } = sinks();
  await renderLayer(dir, {}, fileMap, fragments);
  expect(fragments.get("package.json")).toBeUndefined();
  expect(fileMap.get("apps/web/package.json")).toBe('{"name":"web"}');
});
