import { expect, test } from "vitest";

import type { ProjectConfig } from "@/core/types";

import { VERSIONS } from "../config/dependencies";
import {
  activeFeatures,
  dependenciesFragment,
  featureDependencies,
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
