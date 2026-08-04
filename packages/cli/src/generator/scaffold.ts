import fs from "fs-extra";

import type { ProjectConfig } from "@/core/types";

import { composeProject } from "./compose";
import { prepareTarget } from "./prepare-target";
import { TEMPLATES_DIR as defaultTemplatesDir } from "./templates-path";
import { writeFileMap } from "./write";

export interface ScaffoldOptions {
  /** Override the templates directory (used by tests). */
  templatesDir?: string;
}

/**
 * Generate a project from the resolved config: compose it in memory, then write
 * it to disk. A target directory that did not exist before this run is removed
 * on failure.
 *
 * @param config - The resolved project configuration.
 * @param options - Optional overrides (e.g. the templates directory for tests).
 */
export const scaffold = async (
  config: ProjectConfig,
  options: ScaffoldOptions = {},
): Promise<void> => {
  const templates = options.templatesDir ?? defaultTemplatesDir;
  const fileMap = await composeProject(config, templates);

  const createdFresh = !(await fs.pathExists(config.targetDir));
  try {
    await prepareTarget(config.targetDir, config.action);
    await writeFileMap(config.targetDir, fileMap);
  } catch (error) {
    if (createdFresh) await fs.remove(config.targetDir);
    throw error;
  }
};
