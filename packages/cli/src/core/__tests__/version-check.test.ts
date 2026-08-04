import { expect, test } from "vitest";

import { classifyVersion } from "../version-check";

test("classifyVersion: unknown when latest can't be fetched", () => {
  expect(classifyVersion("1.0.0", null)).toEqual({ state: "unknown" });
});

test("classifyVersion: latest when versions are equal", () => {
  expect(classifyVersion("1.2.3", "1.2.3")).toEqual({ state: "latest" });
});

test("classifyVersion: outdated when the registry is newer", () => {
  expect(classifyVersion("1.0.0", "1.2.0")).toEqual({
    state: "outdated",
    latest: "1.2.0",
  });
});

test("classifyVersion: latest when the local build is ahead of the registry", () => {
  expect(classifyVersion("2.0.0", "1.9.9")).toEqual({ state: "latest" });
});
