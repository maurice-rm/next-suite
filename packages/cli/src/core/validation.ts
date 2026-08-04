import validateNpmName from "validate-npm-package-name";

import { isExistingFile } from "./fs-checks";
import { isWithinCwd, resolveTarget } from "./target";

/**
 * Validate a project name or path: rejects empty input, targets outside the
 * current directory, invalid npm names, and paths that resolve to an existing
 * file.
 *
 * @param value - Raw user input: a name, a relative path, or "." for the cwd.
 * @returns An error message, or `undefined` when the input is a usable target.
 */
export const validateProjectInput = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Name or path is required.";

  const { targetDir, projectName } = resolveTarget(trimmed);

  if (!isWithinCwd(targetDir)) {
    return "Target must be inside the current directory — no '..' or absolute paths.";
  }

  const result = validateNpmName(projectName);
  if (!result.validForNewPackages) {
    return (
      result.errors?.[0] ?? result.warnings?.[0] ?? "Invalid project name."
    );
  }

  if (isExistingFile(targetDir)) {
    return "A file already exists at that path — choose another name.";
  }
  return undefined;
};

const SHADCN_PRESET_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a shadcn/create preset code. Empty/undefined is allowed (it defers to
 * the blank-base default); a non-empty value must be a bare token so it is safe
 * to hand to `shadcn/create`. Shared by the wizard prompt and the `--yes` path.
 *
 * @param value - The raw preset input.
 * @returns An error message, or `undefined` when the value is usable.
 */
export const validateShadcnPreset = (
  value: string | undefined,
): string | undefined => {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return undefined;
  return SHADCN_PRESET_PATTERN.test(trimmed)
    ? undefined
    : "Use only letters, numbers, - or _.";
};
