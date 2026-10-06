import fs from "fs-extra";

import type { ProjectConfig } from "@/core/types";

import { composeProject } from "./compose";
import { prepareTarget } from "./prepare-target";
import { TEMPLATES_DIR } from "./templates-path";
import { writeFileMap } from "./write";

interface ScaffoldOptions {
  /** Override the templates directory (used by tests). */
  templatesDir?: string;
}

/**
 * Generate a project from the resolved config: compose it in memory, then write
 * it to disk. A target directory that did not exist before this run is removed
 * on failure.
 */
export const scaffold = async (
  config: ProjectConfig,
  options: ScaffoldOptions = {},
): Promise<void> => {
  const fileMap = await composeProject(
    config,
    options.templatesDir ?? TEMPLATES_DIR,
  );

  const isNewTarget = !(await fs.pathExists(config.targetDir));
  try {
    await prepareTarget(config.targetDir, config.action);
    await writeFileMap(config.targetDir, fileMap);
  } catch (error) {
    if (isNewTarget) await fs.remove(config.targetDir);
    throw error;
  }
};
