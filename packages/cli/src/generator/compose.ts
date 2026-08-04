import path from "node:path";

import type { ProjectConfig } from "@/core/types";

import { buildManifest, serializeManifest } from "./manifest";
import { MERGEABLES } from "./merge";
import {
  type FileMap,
  type Fragments,
  pushFragment,
  renderLayer,
} from "./render";
import {
  activeFeatures,
  dependenciesFragment,
  featureDependencies,
} from "./resolve";

/**
 * Compose a project entirely in memory: render every active feature, add the
 * resolved dependencies, then merge the collected fragments into their final
 * files. Performs no disk writes.
 *
 * @param config - The resolved project configuration.
 * @param templatesDir - Absolute path to the templates root (holds `base/`, `features/`).
 * @returns The finished project as a FileMap (relative POSIX path → content).
 * @throws If composition produces no files.
 */
export const composeProject = async (
  config: ProjectConfig,
  templatesDir: string,
): Promise<FileMap> => {
  const fileMap: FileMap = new Map();
  const fragments: Fragments = new Map();

  const features = activeFeatures(config);
  for (const feature of features) {
    await renderLayer(
      path.join(templatesDir, feature.dir),
      config,
      fileMap,
      fragments,
    );
  }

  const depsFragment = dependenciesFragment(
    features.flatMap((feature) =>
      featureDependencies(feature.dependencies, config),
    ),
    features.flatMap((feature) =>
      featureDependencies(feature.devDependencies, config),
    ),
  );
  if (depsFragment) {
    pushFragment(fragments, "package.json", depsFragment);
  }

  for (const { file, merge } of MERGEABLES) {
    const collected = fragments.get(file);
    if (collected?.length) fileMap.set(file, merge(collected));
  }

  const envExample = fileMap.get(".env.example");
  if (typeof envExample === "string") fileMap.set(".env", envExample);

  if (fileMap.size === 0) throw new Error("Composition produced no files.");

  fileMap.set("next-suite.json", serializeManifest(buildManifest(config)));

  return fileMap;
};
