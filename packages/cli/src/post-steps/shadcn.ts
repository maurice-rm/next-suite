import type { ShadcnOptions } from "@/core/types";
import {
  getPackageManagerEntry,
  type PackageManager,
} from "@/package-managers";

import { run } from "./run";

// The shadcn CLI contract these calls target; bump together if the CLI changes.
const SHADCN_PACKAGE = "shadcn@latest";
const SHADCN_INIT = "init";
const SHADCN_TEMPLATE = "next";
// shadcn/create's blank-base preset (fallback when none given).
const DEFAULT_PRESET = "b0";

/** The package manager's one-off runner (DLX) as command + args. */
const dlxCommand = (
  packageManager: PackageManager,
): readonly [string, ...string[]] => getPackageManagerEntry(packageManager).dlx;

const shadcnFlags = (shadcn: ShadcnOptions): string[] => {
  const preset = shadcn.preset?.trim() || DEFAULT_PRESET;
  return [
    "--template",
    SHADCN_TEMPLATE,
    "--base",
    shadcn.base,
    shadcn.pointer ? "--pointer" : "--no-pointer",
    "--preset",
    preset,
    "--yes",
  ];
};

/**
 * Initialize shadcn/ui in the generated project via the chosen package manager's
 * runner. The flag names target the current shadcn CLI and may need adjusting
 * per shadcn version.
 *
 * @param targetDir - The generated project directory.
 * @param packageManager - The package manager whose runner executes shadcn.
 * @param shadcn - The shadcn options collected by the wizard (base/pointer/preset).
 */
export const initShadcn = async (
  targetDir: string,
  packageManager: PackageManager,
  shadcn: ShadcnOptions,
): Promise<void> => {
  const [command, ...prefix] = dlxCommand(packageManager);
  await run(
    command,
    [...prefix, SHADCN_PACKAGE, SHADCN_INIT, ...shadcnFlags(shadcn)],
    {
      cwd: targetDir,
    },
  );
};
