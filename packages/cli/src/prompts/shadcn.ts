import { validateShadcnPreset } from "@/core/validation";
import { SHADCN_BASES } from "@/options";
import { defineConfirm, defineSelect, navigableText } from "@/ui";

/** Which primitives library shadcn/ui builds on (maps to `--base`). */
export const selectBase = defineSelect(
  "Which base library should shadcn/ui use?",
  [...SHADCN_BASES],
);

/** Whether buttons get `cursor: pointer` (maps to `--pointer`). */
export const confirmPointer = defineConfirm("Use a pointer cursor on buttons?");

/**
 * Optional shadcn/create preset code (maps to `--preset`); empty input defers
 * to the generator's blank-base default.
 *
 * @param canGoBack - Whether to offer back-navigation to the previous step.
 * @param initialValue - Pre-filled value when re-entering the step.
 * @returns The preset code (empty for the default), or GO_BACK / the cancel symbol.
 */
export const inputPreset = (
  canGoBack: boolean,
  initialValue?: string,
): Promise<string | symbol> =>
  navigableText({
    message:
      "Preset code from shadcn/create (optional — empty uses the blank base preset)",
    placeholder: "e.g. b27GcrRo",
    initialValue,
    canGoBack,
    validate: validateShadcnPreset,
  });
