import path from "node:path";

import fs from "fs-extra";

import type { FileMap } from "./render";

/**
 * Write every entry of a FileMap to disk under `targetDir`, creating parent
 * directories as needed. Relative POSIX paths are translated to the host OS.
 *
 * @param targetDir - Absolute path to write into.
 * @param fileMap - Relative POSIX path → file content.
 */
export const writeFileMap = async (
  targetDir: string,
  fileMap: FileMap,
): Promise<void> => {
  for (const [relativePath, content] of fileMap) {
    await fs.outputFile(
      path.join(targetDir, ...relativePath.split("/")),
      content,
    );
  }
};
