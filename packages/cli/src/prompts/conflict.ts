import path from "node:path";

import type { ResolvedTarget } from "@/core/target";
import type { ConflictChoice } from "@/core/types";
import { type NavigableOption, navigableSelect } from "@/ui";

type ConflictOptionValue = ConflictChoice | "cancel";

/** Single source of truth for conflict-resolution labels, ordered as displayed. */
const CONFLICT_LABELS: Record<ConflictChoice, string> = {
  empty: "Empty the directory — delete everything except .git",
  overwrite: "Continue (keep existing files)",
};

const buildConflictOptions = (
  target: ResolvedTarget,
): NavigableOption<ConflictOptionValue>[] => [
  ...Object.entries(CONFLICT_LABELS)
    .filter(([value]) => !(target.isCwd && value === "empty"))
    .map(([value, label]) => ({ value: value as ConflictChoice, label })),
  { value: "cancel", label: "Cancel" },
];

/**
 * Ask how to proceed when the target directory already contains files. The
 * current working directory is never offered "empty".
 *
 * @returns The chosen action or "cancel", or GO_BACK / the cancel symbol.
 */
export const selectConflictAction = (
  canGoBack: boolean,
  target: ResolvedTarget,
): Promise<ConflictOptionValue | symbol> => {
  const where = path.relative(process.cwd(), target.targetDir) || ".";
  return navigableSelect<ConflictOptionValue>({
    message: `"${where}" exists and is not empty. How would you like to proceed?`,
    options: buildConflictOptions(target),
    canGoBack,
  });
};
