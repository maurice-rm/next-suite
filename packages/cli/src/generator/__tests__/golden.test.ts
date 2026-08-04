import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import type { ConflictAction } from "@/core/types";

import { composeProject } from "../compose";
import type { FileMap } from "../render";
import { baseConfig, SCENARIOS } from "./scenarios";

// Golden snapshot of the in-memory FileMap produced by the REAL composition
// pipeline (un-mocked resolve → real FEATURES/VERSIONS/templates). This is the
// safety net for refactoring: if a refactor changes a single byte of the
// generated output, the snapshot fails. A deliberate output change must update
// the snapshot in the same commit, with the reason stated in the message —
// never refresh it casually.
const TEMPLATES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "templates",
);

/** Serialize a FileMap to a deterministic, diff-friendly string (path-sorted). */
const serialize = (fileMap: FileMap): string =>
  [...fileMap.keys()]
    .sort()
    .map((key) => {
      const content = fileMap.get(key) as string | Buffer;
      const body =
        typeof content === "string"
          ? content
          : `<binary ${content.length} bytes sha256:${createHash("sha256")
              .update(content)
              .digest("hex")}>`;
      return `=== ${key} ===\n${body}`;
    })
    .join("\n\n");

describe("golden FileMap", () => {
  test.each(SCENARIOS)("$name", async ({ config }) => {
    const fileMap = await composeProject(config, TEMPLATES);
    expect(serialize(fileMap)).toMatchSnapshot();
  });

  test("composed FileMap is invariant to the conflict action", async () => {
    const actions: ConflictAction[] = ["create", "overwrite", "empty"];
    const serialized = await Promise.all(
      actions.map((action) =>
        composeProject({ ...baseConfig, action }, TEMPLATES).then(serialize),
      ),
    );
    expect(new Set(serialized).size).toBe(1);
  });
});
