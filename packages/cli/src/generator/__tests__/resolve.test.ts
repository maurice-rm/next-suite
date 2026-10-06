import { expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { VERSIONS } from "../config/dependencies";
import {
  activeFeatures,
  dependenciesFragment,
  featureDependencies,
  overridesFragment,
} from "../resolve";

test("base is always the first active feature", () => {
  expect(activeFeatures({} as ProjectConfig)[0]?.dir).toBe("base");
});

test("resolves declared dependency names to their catalog versions", () => {
  const fragment = JSON.parse(
    dependenciesFragment(["next"], ["typescript"]) as string,
  );
  expect(fragment.dependencies.next).toBe(VERSIONS.next);
  expect(fragment.devDependencies.typescript).toBe(VERSIONS.typescript);
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
      (c) => (c.tailwind ? ["tailwindcss"] : ["typescript"]),
      config,
    ),
  ).toEqual(["typescript"]);
});

test("overridesFragment nests the versions under the package manager's field", () => {
  const expected = { next: VERSIONS.next };
  expect(JSON.parse(overridesFragment(["next"], "npm") as string)).toEqual({
    overrides: expected,
  });
  expect(JSON.parse(overridesFragment(["next"], "pnpm") as string)).toEqual({
    pnpm: { overrides: expected },
  });
  expect(JSON.parse(overridesFragment(["next"], "yarn") as string)).toEqual({
    resolutions: expected,
  });
});

test("overridesFragment returns undefined when nothing is overridden", () => {
  expect(overridesFragment([], "npm")).toBeUndefined();
});
