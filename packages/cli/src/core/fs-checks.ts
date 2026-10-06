import fs from "fs-extra";

/**
 * Files/dirs that are safe to leave in place when scaffolding — their presence
 * does not count as a conflict (mirrors create-next-app's allow-list).
 */
const BENIGN_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".gitattributes",
  ".gitkeep",
  ".idea",
  ".vscode",
  ".DS_Store",
  "Thumbs.db",
  ".npmignore",
  "LICENSE",
  "LICENSE.md",
]);

const isBenign = (entry: string): boolean =>
  BENIGN_ENTRIES.has(entry) || entry.endsWith(".iml");

/**
 * Check whether a directory holds files that would conflict with scaffolding. A
 * missing directory, an empty one, or one holding only benign files is
 * conflict-free. A non-directory path is treated as conflict-free here — it is
 * rejected earlier during input validation via {@link isExistingFile}.
 *
 * @param directory - Absolute path to the prospective target directory.
 */
export const hasConflictingFiles = async (
  directory: string,
): Promise<boolean> => {
  if (!(await fs.pathExists(directory))) return false;
  if (!(await fs.stat(directory)).isDirectory()) return false;
  const entries = await fs.readdir(directory);
  return entries.some((entry) => !isBenign(entry));
};

/**
 * Whether a path points at an existing file. Synchronous on purpose: it runs
 * inside clack's `validate` callback, which clack invokes synchronously.
 */
export const isExistingFile = (target: string): boolean =>
  fs.existsSync(target) && fs.statSync(target).isFile();
