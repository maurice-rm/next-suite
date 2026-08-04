import { PACKAGE_MANAGERS, type PackageManager } from "@/package-managers";
import { defineConfirm, type NavigableOption, navigableSelect } from "@/ui";

const PACKAGE_MANAGER_OPTIONS: NavigableOption<PackageManager>[] =
  PACKAGE_MANAGERS.map((pm) => ({ value: pm.id, label: pm.label }));

const packageManagerOptions = (
  detected?: PackageManager,
): NavigableOption<PackageManager>[] =>
  PACKAGE_MANAGER_OPTIONS.map((option) =>
    option.value === detected ? { ...option, hint: "detected" } : option,
  );

/**
 * Prompt for the package manager, pre-selecting the detected one.
 *
 * @param canGoBack - Whether to offer back-navigation to the previous step.
 * @param initialValue - Initial cursor position; falls back to `detected`.
 * @returns The chosen package manager, or GO_BACK / the cancel symbol.
 */
export const selectPackageManager = (
  canGoBack: boolean,
  detected?: PackageManager,
  initialValue?: PackageManager,
): Promise<PackageManager | symbol> =>
  navigableSelect<PackageManager>({
    message: "Which package manager would you like to use?",
    options: packageManagerOptions(detected),
    initialValue: initialValue ?? detected,
    canGoBack,
  });

export const confirmInstall = defineConfirm("Install dependencies?");
