import path from "node:path";

import fs from "fs-extra";

import { isUnsafeToEmpty } from "@/core/target";
import type { ConflictAction } from "@/core/types";

/**
 * Prepare the target directory according to the chosen conflict action.
 *
 * @param targetDir - Absolute path to the target directory.
 * @param action - "create"/"overwrite" leave existing files; "empty" is a full
 *   clear that deletes everything except `.git` — including entries the conflict
 *   check treats as benign (e.g. `LICENSE`, `.vscode`), by design.
 * @throws If "empty" would delete a filesystem root, the home directory, or a
 *   parent of the current directory.
 */
export const prepareTarget = async (
  targetDir: string,
  action: ConflictAction,
): Promise<void> => {
  if (action === "empty" && isUnsafeToEmpty(targetDir)) {
    throw new Error(
      `Refusing to empty ${targetDir}: it is a filesystem root, your home directory, or a parent of the current directory.`,
    );
  }
  await fs.ensureDir(targetDir);
  if (action !== "empty") return;
  for (const entry of await fs.readdir(targetDir)) {
    if (entry !== ".git") await fs.remove(path.join(targetDir, entry));
  }
};
