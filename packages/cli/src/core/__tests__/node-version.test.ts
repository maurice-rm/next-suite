import { expect, test } from "vitest";

import { satisfiesNodeRange } from "../node-version";

test("accepts the exact floor and anything above it", () => {
  expect(satisfiesNodeRange("22.0.0", ">=22.0.0")).toBe(true);
  expect(satisfiesNodeRange("22.3.1", ">=22.0.0")).toBe(true);
  expect(satisfiesNodeRange("23.1.0", ">=22.0.0")).toBe(true);
});

test("rejects anything below the floor", () => {
  expect(satisfiesNodeRange("20.19.0", ">=22.0.0")).toBe(false);
  expect(satisfiesNodeRange("18.20.4", ">=22.0.0")).toBe(false);
});

test("compares minor and patch, not just major", () => {
  expect(satisfiesNodeRange("22.0.0", ">=22.1.0")).toBe(false);
  expect(satisfiesNodeRange("22.1.0", ">=22.0.5")).toBe(true);
  expect(satisfiesNodeRange("22.0.5", ">=22.0.5")).toBe(true);
});

test("tolerates a bare process.versions.node and a major-only range", () => {
  expect(satisfiesNodeRange("22.11.0", "22")).toBe(true);
  expect(satisfiesNodeRange("21.7.3", ">=22")).toBe(false);
});
