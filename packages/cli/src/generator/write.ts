import path from "node:path";

import fs from "fs-extra";

import type { FileMap } from "./render";

/** Relative POSIX paths are translated to the host OS; parents are created. */
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
