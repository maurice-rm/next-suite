import { expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { VERSIONS } from "../config/dependencies";
import {
  activeFeatures,
  dependenciesFragment,
  featureDependencies,
  overridesFragment,
} from "../resolve";
import { baseConfig } from "./scenarios";

const parseJson = (text: string | undefined): unknown => {
  if (text === undefined) throw new Error("Expected a JSON fragment.");
  return JSON.parse(text);
};

test("base is always the first active feature", () => {
  expect(activeFeatures(baseConfig)[0]?.dir).toBe("base");
});

test("resolves declared dependency names to their catalog versions", () => {
  expect(parseJson(dependenciesFragment(["next"], ["typescript"]))).toEqual({
    dependencies: { next: VERSIONS.next },
    devDependencies: { typescript: VERSIONS.typescript },
  });
});

test("returns undefined when no dependencies are declared", () => {
  expect(dependenciesFragment([], [])).toBeUndefined();
});

test("featureDependencies passes lists through and invokes functions", () => {
  const config = { tailwind: false } as ProjectConfig;
  expect(featureDependencies(undefined, config)).toEqual([]);
  expect(featureDependencies(["next"], config)).toEqual(["next"]);
  expect(
    featureDependencies(
      (current) => (current.tailwind ? ["tailwindcss"] : ["typescript"]),
      config,
    ),
  ).toEqual(["typescript"]);
});

test("overridesFragment nests the versions under the package manager's field", () => {
  const overrides = { next: VERSIONS.next };
  expect(parseJson(overridesFragment(overrides, "npm"))).toEqual({
    overrides,
  });
  expect(parseJson(overridesFragment(overrides, "yarn"))).toEqual({
    resolutions: overrides,
  });
});

test("overridesFragment leaves pnpm's overrides to pnpm-workspace.yaml", () => {
  expect(overridesFragment({ next: VERSIONS.next }, "pnpm")).toBeUndefined();
});

test("overridesFragment returns undefined when nothing is overridden", () => {
  expect(overridesFragment({}, "npm")).toBeUndefined();
});
