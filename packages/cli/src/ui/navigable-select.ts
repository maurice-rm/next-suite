import { SelectPrompt, type State } from "@clack/core";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";

import { withGoBack } from "./go-back";
import {
  brand,
  pick,
  renderPromptTitle,
  renderResolved,
  selectFooter,
} from "./style";

export interface NavigableOption<T> {
  value: T;
  label: string;
  hint?: string;
}

interface SelectRenderState<T> {
  state: State;
  cursor: number;
  options: NavigableOption<T>[];
}

const renderOption = <T>(option: NavigableOption<T>, isActive: boolean) => {
  const dot = isActive ? pick(SYMBOLS.radioOn) : ansis.dim(SYMBOLS.radioOff);
  const label = isActive ? option.label : ansis.dim(option.label);
  const hint = option.hint ? ` ${ansis.dim(`(${option.hint})`)}` : "";
  return `${dot} ${label}${hint}`;
};

const renderSelect = <T>(
  self: SelectRenderState<T>,
  message: string,
  canGoBack: boolean,
): string => {
  const title = renderPromptTitle(self.state, message);

  if (self.state === "submit" || self.state === "cancel") {
    const current = self.options[self.cursor];
    return renderResolved(title, self.state, current?.label ?? "");
  }

  const list = self.options
    .map((option, index) => renderOption(option, index === self.cursor))
    .join(`\n${brand(SYMBOLS.bar)}  `);

  return `${title}${brand(SYMBOLS.bar)}  ${list}\n${brand(SYMBOLS.barEnd)}\n   ${selectFooter(canGoBack)}\n`;
};

interface NavigableSelectOptions<T> {
  message: string;
  options: NavigableOption<T>[];
  initialValue?: T;
  canGoBack?: boolean;
}

/**
 * A single-choice list prompt with "b" back-navigation.
 *
 * @returns The chosen value, or GO_BACK / the cancel symbol.
 */
export const navigableSelect = <T>(
  options: NavigableSelectOptions<T>,
): Promise<T | symbol> => {
  const canGoBack = options.canGoBack ?? false;
  const prompt = new SelectPrompt({
    options: options.options,
    initialValue: options.initialValue,
    render() {
      return renderSelect(this, options.message, canGoBack);
    },
  });
  return withGoBack(prompt, canGoBack, (char) => char === "b") as Promise<
    T | symbol
  >;
};

/**
 * Build a reusable select prompt from a fixed option list (the common case).
 *
 * @returns A prompt function taking `canGoBack` and an optional `initialValue`
 *   (to restore the prior choice on back-navigation), resolving to the choice.
 */
export const defineSelect =
  <T>(message: string, options: NavigableOption<T>[]) =>
  (canGoBack: boolean, initialValue?: T): Promise<T | symbol> =>
    navigableSelect<T>({ message, options, initialValue, canGoBack });
