import path from "node:path";

import type { ConflictChoice } from "@/core/types";
import { type NavigableOption, navigableSelect } from "@/ui";

type ConflictOptionValue = ConflictChoice | "cancel";

/** Single source of truth for conflict-resolution labels, ordered as displayed. */
const CONFLICT_LABELS: Record<ConflictChoice, string> = {
  empty: "Empty the directory — delete everything except .git",
  overwrite: "Continue (keep existing files)",
};

const conflictOptions = (
  isCwd: boolean,
): NavigableOption<ConflictOptionValue>[] => [
  ...Object.entries(CONFLICT_LABELS)
    .filter(([value]) => !(isCwd && value === "empty"))
    .map(([value, label]) => ({ value: value as ConflictChoice, label })),
  { value: "cancel", label: "Cancel" },
];

/**
 * Ask how to proceed when the target directory already contains files.
 *
 * @param canGoBack - Whether to offer back-navigation to the previous step.
 * @param targetDir - The resolved (non-empty) target directory.
 * @param isCwd - Whether the target is the current working directory.
 * @returns The chosen action or "cancel", or GO_BACK / the cancel symbol.
 */
export const selectConflictAction = (
  canGoBack: boolean,
  targetDir: string,
  isCwd: boolean,
): Promise<ConflictOptionValue | symbol> => {
  const where = path.relative(process.cwd(), targetDir) || ".";
  return navigableSelect<ConflictOptionValue>({
    message: `"${where}" exists and is not empty. How would you like to proceed?`,
    options: conflictOptions(isCwd),
    canGoBack,
  });
};
