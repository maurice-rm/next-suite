import os from "node:os";
import path from "node:path";

export interface ResolvedTarget {
  targetDir: string;
  projectName: string;
  isCwd: boolean;
}

/**
 * Resolve a user-supplied name, relative path, or "." into an absolute target.
 *
 * @param input - The raw project name or path.
 * @returns The absolute target directory, the derived project name, and whether
 *   it points at the current working directory.
 */
export const resolveTarget = (input: string): ResolvedTarget => {
  const targetDir = path.resolve(process.cwd(), input.trim());
  return {
    targetDir,
    projectName: path.basename(targetDir),
    isCwd: targetDir === process.cwd(),
  };
};

/**
 * Whether a resolved target stays within the current working directory (the cwd
 * itself counts as inside). Inputs that escape it — `..`, a sibling, or an
 * unrelated absolute path — are rejected during validation, because the
 * destructive "empty" action would otherwise delete files outside the project.
 *
 * @param targetDir - Absolute target directory (from {@link resolveTarget}).
 * @returns `true` when `targetDir` is the cwd or a descendant of it.
 */
export const isWithinCwd = (targetDir: string): boolean => {
  const rel = path.relative(process.cwd(), targetDir);
  return (
    !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`)
  );
};

/**
 * Whether emptying this directory would be catastrophic: a filesystem root, the
 * home directory, or the cwd or an ancestor of it. The "empty" action deletes
 * everything but `.git`, so it must refuse these even if validation was somehow
 * bypassed — a defense-in-depth guard, not the primary check ({@link isWithinCwd}).
 *
 * @param targetDir - Absolute target directory.
 * @returns `true` when emptying `targetDir` must be refused.
 */
export const isUnsafeToEmpty = (targetDir: string): boolean => {
  const resolved = path.resolve(targetDir);
  const cwd = process.cwd();
  return (
    path.dirname(resolved) === resolved ||
    resolved === os.homedir() ||
    cwd === resolved ||
    cwd.startsWith(`${resolved}${path.sep}`)
  );
};
