import type { ProjectConfig } from "@/core/types";
import {
  getPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

import { type DependencyName, VERSIONS } from "./config/dependencies";
import {
  type Feature,
  type FeatureDependencies,
  FEATURES,
} from "./config/features";

/** The features that apply to a config, in registry order (base first). */
export const activeFeatures = (config: ProjectConfig): Feature[] =>
  FEATURES.filter((feature) => feature.when?.(config) ?? true);

export const featureDependencies = (
  declared: FeatureDependencies | undefined,
  config: ProjectConfig,
): DependencyName[] =>
  typeof declared === "function" ? declared(config) : (declared ?? []);

const resolveVersions = (names: DependencyName[]): Record<string, string> =>
  Object.fromEntries(names.map((name) => [name, VERSIONS[name]]));

/** @returns A package.json fragment, or `undefined` when both lists are empty. */
export const dependenciesFragment = (
  dependencies: DependencyName[],
  devDependencies: DependencyName[],
): string | undefined => {
  const fragment: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};
  if (dependencies.length)
    fragment.dependencies = resolveVersions(dependencies);
  if (devDependencies.length)
    fragment.devDependencies = resolveVersions(devDependencies);
  return Object.keys(fragment).length ? JSON.stringify(fragment) : undefined;
};

/** The transitive packages the active features force to a catalog version. */
export const dependencyOverrides = (
  config: ProjectConfig,
): Record<string, string> =>
  resolveVersions(
    activeFeatures(config).flatMap((feature) =>
      featureDependencies(feature.overrides, config),
    ),
  );

/**
 * Place the overrides under the package.json field the package manager reads.
 *
 * @returns A package.json fragment, or `undefined` when there is nothing to
 *   override or the manager reads overrides from its own config file.
 */
export const overridesFragment = (
  overrides: Record<string, string>,
  packageManager: PackageManager,
): string | undefined => {
  const { overridesPath } = getPackageManagerEntry(packageManager);
  if (!overridesPath || !Object.keys(overrides).length) return undefined;
  const fragment = overridesPath.reduceRight<unknown>(
    (nested, key) => ({ [key]: nested }),
    overrides,
  );
  return JSON.stringify(fragment);
};
