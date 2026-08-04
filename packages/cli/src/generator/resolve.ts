import type { ProjectConfig } from "@/core/types";

import { type DependencyName, VERSIONS } from "./config/dependencies";
import {
  type Feature,
  type FeatureDependencies,
  FEATURES,
} from "./config/features";

/**
 * Select the features that apply to a config, in registry order.
 *
 * @param config - The resolved project configuration.
 * @returns The active features (base first).
 */
export const activeFeatures = (config: ProjectConfig): Feature[] =>
  FEATURES.filter((feature) => feature.when?.(config) ?? true);

/**
 * Resolve a feature's declared dependencies against the config: a list passes
 * through, a function is invoked, absence yields [].
 */
export const featureDependencies = (
  declared: FeatureDependencies | undefined,
  config: ProjectConfig,
): DependencyName[] =>
  typeof declared === "function" ? declared(config) : (declared ?? []);

const resolve = (names: DependencyName[]): Record<string, string> =>
  Object.fromEntries(names.map((name) => [name, VERSIONS[name]]));

/**
 * Build a package.json fragment (dependencies + devDependencies) from catalog
 * dependency names, resolving each to its version.
 *
 * @param dependencies - Runtime dependency names.
 * @param devDependencies - Dev dependency names.
 * @returns A JSON package.json fragment string, or `undefined` when both are empty.
 */
export const dependenciesFragment = (
  dependencies: DependencyName[],
  devDependencies: DependencyName[],
): string | undefined => {
  const fragment: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};
  if (dependencies.length) fragment.dependencies = resolve(dependencies);
  if (devDependencies.length)
    fragment.devDependencies = resolve(devDependencies);
  return Object.keys(fragment).length ? JSON.stringify(fragment) : undefined;
};
