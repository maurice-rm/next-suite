import { ConfirmPrompt, type State } from "@clack/core";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";

import { withGoBack } from "./go-back";
import {
  brand,
  confirmFooter,
  pick,
  renderPromptTitle,
  renderResolved,
} from "./style";

interface ConfirmRenderState {
  state: State;
  value?: boolean;
}

interface ConfirmRenderOptions {
  message: string;
  active: string;
  inactive: string;
  canGoBack: boolean;
}

const renderChoice = (label: string, isSelected: boolean): string =>
  isSelected
    ? `${pick(SYMBOLS.radioOn)} ${label}`
    : ansis.dim(`${SYMBOLS.radioOff} ${label}`);

const renderConfirm = (
  self: ConfirmRenderState,
  options: ConfirmRenderOptions,
): string => {
  const title = renderPromptTitle(self.state, options.message);
  const isConfirmed = self.value === true;

  if (self.state === "submit" || self.state === "cancel") {
    const chosen = isConfirmed ? options.active : options.inactive;
    return renderResolved(title, self.state, chosen);
  }

  const choices = `${renderChoice(options.active, isConfirmed)} ${ansis.dim("/")} ${renderChoice(options.inactive, !isConfirmed)}`;

  return `${title}${brand(SYMBOLS.bar)}  ${choices}\n${brand(SYMBOLS.barEnd)}\n   ${confirmFooter(options.canGoBack)}\n`;
};

interface NavigableConfirmOptions {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
  canGoBack?: boolean;
}

/**
 * A yes/no confirm prompt with "b" back-navigation.
 *
 * @returns The boolean choice, or GO_BACK / the cancel symbol.
 */
export const navigableConfirm = (
  options: NavigableConfirmOptions,
): Promise<boolean | symbol> => {
  const renderOptions: ConfirmRenderOptions = {
    message: options.message,
    active: options.active ?? "Yes",
    inactive: options.inactive ?? "No",
    canGoBack: options.canGoBack ?? false,
  };
  const prompt = new ConfirmPrompt({
    active: renderOptions.active,
    inactive: renderOptions.inactive,
    initialValue: options.initialValue ?? true,
    render() {
      return renderConfirm(this, renderOptions);
    },
  });
  return withGoBack(
    prompt,
    renderOptions.canGoBack,
    (char) => char === "b",
  ) as Promise<boolean | symbol>;
};

/**
 * Build a reusable yes/no confirm prompt (the common case).
 *
 * @returns A prompt function taking `canGoBack` and the prior answer (to
 *   restore it on back-navigation), resolving to the boolean.
 */
export const defineConfirm =
  (message: string) =>
  (canGoBack: boolean, wasConfirmed?: boolean): Promise<boolean | symbol> =>
    navigableConfirm({ message, initialValue: wasConfirmed, canGoBack });
