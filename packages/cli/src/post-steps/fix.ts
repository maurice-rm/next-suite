import type { PackageManager } from "@/package-managers";

import { run } from "./run";

/**
 * Run the generated project's own `fix` script (`eslint --fix` + Prettier), so
 * the committed initial state is both import-sorted and formatted — exactly what
 * a pre-commit run would produce (the initial commit itself uses `--no-verify`).
 * Runs only after a successful install, since it relies on the project's
 * toolchain.
 *
 * @param targetDir - The generated project directory.
 * @param packageManager - The package manager whose `run` executes the script.
 */
export const fixProject = async (
  targetDir: string,
  packageManager: PackageManager,
): Promise<void> => {
  await run(packageManager, ["run", "fix"], { cwd: targetDir });
};
