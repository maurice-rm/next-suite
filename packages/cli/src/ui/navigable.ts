import {
  ConfirmPrompt,
  GroupMultiSelectPrompt,
  SelectPrompt,
  type State,
  TextPrompt,
} from "@clack/core";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";
import { GO_BACK } from "@/wizard";

import {
  brand,
  confirmFooter,
  multiselectFooter,
  pick,
  selectFooter,
  stateGlyph,
  textFooter,
} from "./style";

interface BackablePrompt {
  prompt(): Promise<unknown>;
  on(
    event: "key",
    listener: (char?: string, key?: { name?: string }) => void,
  ): void;
}

/**
 * Wire back-navigation onto a prompt: when `canGoBack` and a key matching
 * `isBackKey` is pressed, the returned promise resolves to {@link GO_BACK}
 * instead of the prompt's own value.
 *
 * @param prompt - The clack prompt to drive.
 * @param canGoBack - Whether to offer back-navigation to the previous step.
 * @param isBackKey - Predicate deciding whether a key press means "go back".
 * @returns The prompt's value, or GO_BACK when the back key was pressed.
 */
export const withGoBack = (
  prompt: BackablePrompt,
  canGoBack: boolean,
  isBackKey: (char?: string, key?: { name?: string }) => boolean,
): Promise<unknown> => {
  let goBack = false;
  if (canGoBack) {
    prompt.on("key", (char, key) => {
      if (isBackKey(char, key)) {
        goBack = true;
        (prompt as unknown as { state: State }).state = "cancel";
      }
    });
  }
  return prompt.prompt().then((result) => (goBack ? GO_BACK : result));
};

const promptTitle = (state: State, message: string): string =>
  `${ansis.gray(SYMBOLS.bar)}\n${stateGlyph(state)}  ${message}\n`;

// The resolved (submit/cancel) line shared by the list-style prompts: the chosen
// label, struck through and followed by a trailing bar when cancelled.
const renderResolved = (title: string, state: State, label: string): string => {
  const bar = ansis.gray(SYMBOLS.bar);
  return state === "cancel"
    ? `${title}${bar}  ${ansis.strikethrough(ansis.dim(label))}\n${bar}`
    : `${title}${bar}  ${ansis.dim(label)}`;
};

interface TextRenderState {
  state: State;
  value?: string;
  error?: string;
  userInput?: string;
  userInputWithCursor?: string;
}

const renderText = (
  self: TextRenderState,
  message: string,
  placeholder: string | undefined,
  canGoBack: boolean,
): string => {
  const title = promptTitle(self.state, message);
  const ph = placeholder
    ? ansis.inverse(placeholder[0]) + ansis.dim(placeholder.slice(1))
    : ansis.inverse(ansis.hidden("_"));
  const input = self.userInput
    ? (self.userInputWithCursor ?? self.userInput)
    : ph;
  const committed = self.value ?? "";

  switch (self.state) {
    case "error":
      return `${title.trim()}\n${ansis.yellow(SYMBOLS.bar)}  ${input}\n${ansis.yellow(SYMBOLS.barEnd)}  ${ansis.yellow(self.error ?? "")}\n`;
    case "submit":
      return committed
        ? `${title}${ansis.gray(SYMBOLS.bar)}  ${ansis.dim(committed)}`
        : title.replace(/\n$/, "");
    case "cancel":
      return `${title}${ansis.gray(SYMBOLS.bar)}${committed ? `  ${ansis.strikethrough(ansis.dim(committed))}` : ""}`;
    default:
      return `${title}${brand(SYMBOLS.bar)}  ${input}\n${brand(SYMBOLS.barEnd)}\n   ${textFooter(canGoBack)}\n`;
  }
};

export interface NavigableTextOptions {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string | undefined) => string | undefined;
  canGoBack?: boolean;
}

/**
 * A single-line text prompt with optional validation and Esc back-navigation.
 *
 * @returns The entered string, or GO_BACK / the cancel symbol.
 */
export const navigableText = (
  opts: NavigableTextOptions,
): Promise<string | symbol> => {
  const canGoBack = opts.canGoBack ?? false;
  const prompt = new TextPrompt({
    placeholder: opts.placeholder,
    initialValue: opts.initialValue,
    validate: opts.validate,
    render() {
      return renderText(
        this as unknown as TextRenderState,
        opts.message,
        opts.placeholder,
        canGoBack,
      );
    },
  });
  return withGoBack(
    prompt,
    canGoBack,
    (_char, key) => key?.name === "escape",
  ) as Promise<string | symbol>;
};

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

const renderSelect = <T>(
  self: SelectRenderState<T>,
  message: string,
  canGoBack: boolean,
): string => {
  const title = promptTitle(self.state, message);
  const current = self.options[self.cursor];

  if (self.state === "submit" || self.state === "cancel") {
    return renderResolved(title, self.state, current?.label ?? "");
  }

  const list = self.options
    .map((option, i) => {
      const active = i === self.cursor;
      const dot = active ? pick(SYMBOLS.radioOn) : ansis.dim(SYMBOLS.radioOff);
      const label = active ? option.label : ansis.dim(option.label);
      const optHint = option.hint ? ` ${ansis.dim(`(${option.hint})`)}` : "";
      return `${dot} ${label}${optHint}`;
    })
    .join(`\n${brand(SYMBOLS.bar)}  `);

  return `${title}${brand(SYMBOLS.bar)}  ${list}\n${brand(SYMBOLS.barEnd)}\n   ${selectFooter(canGoBack)}\n`;
};

export interface NavigableSelectOptions<T> {
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
  opts: NavigableSelectOptions<T>,
): Promise<T | symbol> => {
  const canGoBack = opts.canGoBack ?? false;
  const prompt = new SelectPrompt({
    options: opts.options,
    initialValue: opts.initialValue,
    render() {
      return renderSelect(
        this as unknown as SelectRenderState<T>,
        opts.message,
        canGoBack,
      );
    },
  });
  return withGoBack(prompt, canGoBack, (char) => char === "b") as Promise<
    T | symbol
  >;
};

/**
 * Build a reusable select prompt from a fixed option list (the common case).
 *
 * @param message - The question text.
 * @param options - The selectable options, ordered as displayed.
 * @returns A prompt function taking `canGoBack` and an optional `initialValue`
 *   (to restore the prior choice on back-navigation), resolving to the choice.
 */
export const defineSelect =
  <T>(message: string, options: NavigableOption<T>[]) =>
  (canGoBack: boolean, initialValue?: T): Promise<T | symbol> =>
    navigableSelect<T>({ message, options, initialValue, canGoBack });

interface ConfirmRenderState {
  state: State;
  value: boolean;
}

const renderConfirm = (
  self: ConfirmRenderState,
  message: string,
  active: string,
  inactive: string,
  canGoBack: boolean,
): string => {
  const title = promptTitle(self.state, message);
  const chosen = self.value ? active : inactive;

  if (self.state === "submit" || self.state === "cancel") {
    return renderResolved(title, self.state, chosen);
  }

  const option = (selected: boolean, label: string): string =>
    selected
      ? `${pick(SYMBOLS.radioOn)} ${label}`
      : ansis.dim(`${SYMBOLS.radioOff} ${label}`);
  const choices = `${option(self.value, active)} ${ansis.dim("/")} ${option(!self.value, inactive)}`;

  return `${title}${brand(SYMBOLS.bar)}  ${choices}\n${brand(SYMBOLS.barEnd)}\n   ${confirmFooter(canGoBack)}\n`;
};

export interface NavigableConfirmOptions {
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
  opts: NavigableConfirmOptions,
): Promise<boolean | symbol> => {
  const active = opts.active ?? "Yes";
  const inactive = opts.inactive ?? "No";
  const canGoBack = opts.canGoBack ?? false;
  const prompt = new ConfirmPrompt({
    active,
    inactive,
    initialValue: opts.initialValue ?? true,
    render() {
      return renderConfirm(
        this as unknown as ConfirmRenderState,
        opts.message,
        active,
        inactive,
        canGoBack,
      );
    },
  });
  return withGoBack(prompt, canGoBack, (char) => char === "b") as Promise<
    boolean | symbol
  >;
};

/**
 * Build a reusable yes/no confirm prompt (the common case).
 *
 * @param message - The question text.
 * @returns A prompt function taking `canGoBack` and an optional `initialValue`
 *   (to restore the prior choice on back-navigation), resolving to the boolean.
 */
export const defineConfirm =
  (message: string) =>
  (canGoBack: boolean, initialValue?: boolean): Promise<boolean | symbol> =>
    navigableConfirm({ message, initialValue, canGoBack });

// GroupMultiSelectPrompt flattens the groups into one list, tagging each entry
// with `group`: `true` for a header row, or the group name for an item.
interface GroupFlatOption<T> {
  value: T;
  label: string;
  hint?: string;
  group?: string | true;
}

interface GroupMultiRenderState<T> {
  state: State;
  cursor: number;
  options: GroupFlatOption<T>[];
  value?: T[];
}

const renderGroupMultiselect = <T>(
  self: GroupMultiRenderState<T>,
  message: string,
  canGoBack: boolean,
): string => {
  const title = promptTitle(self.state, message);
  const selected = self.value ?? [];

  if (self.state === "submit" || self.state === "cancel") {
    const labels = self.options
      .filter((o) => o.group !== true && selected.includes(o.value))
      .map((o) => o.label);
    return renderResolved(title, self.state, labels.join(", ") || "none");
  }

  const list = self.options
    .map((option, i) => {
      const active = i === self.cursor;
      if (option.group === true) {
        const items = self.options.filter((o) => o.group === option.value);
        const allSelected =
          items.length > 0 && items.every((o) => selected.includes(o.value));
        const box = allSelected
          ? brand(SYMBOLS.checkboxOn)
          : ansis.dim(SYMBOLS.checkboxOff);
        const label = active
          ? ansis.bold(option.label)
          : ansis.dim(option.label);
        return `${box} ${label}`;
      }
      const isLast =
        i === self.options.length - 1 || self.options[i + 1]?.group === true;
      const connector = ansis.dim(isLast ? SYMBOLS.barEnd : SYMBOLS.bar);
      const box = selected.includes(option.value)
        ? brand(SYMBOLS.checkboxOn)
        : ansis.dim(SYMBOLS.checkboxOff);
      const label = active ? option.label : ansis.dim(option.label);
      const optHint = option.hint ? ` ${ansis.dim(`(${option.hint})`)}` : "";
      return `${connector} ${box} ${label}${optHint}`;
    })
    .join(`\n${brand(SYMBOLS.bar)}  `);

  return `${title}${brand(SYMBOLS.bar)}  ${list}\n${brand(SYMBOLS.barEnd)}\n   ${multiselectFooter(canGoBack)}\n`;
};

export interface NavigableGroupMultiselectOptions<T> {
  message: string;
  options: Record<string, NavigableOption<T>[]>;
  initialValues?: T[];
  canGoBack?: boolean;
}

/**
 * A grouped multi-select prompt with checkboxes and tree connectors, "b"
 * back-navigation. Group headers are selectable (`selectableGroups: true`) —
 * toggling one flips its whole group; an empty selection is allowed.
 *
 * @returns The selected values, or GO_BACK / the cancel symbol.
 */
export const navigableGroupMultiselect = <T>(
  opts: NavigableGroupMultiselectOptions<T>,
): Promise<T[] | symbol> => {
  const canGoBack = opts.canGoBack ?? false;
  const prompt = new GroupMultiSelectPrompt<NavigableOption<T>>({
    options: opts.options,
    initialValues: opts.initialValues,
    selectableGroups: true,
    required: false,
    render() {
      return renderGroupMultiselect(
        this as unknown as GroupMultiRenderState<T>,
        opts.message,
        canGoBack,
      );
    },
  });
  return withGoBack(prompt, canGoBack, (char) => char === "b") as Promise<
    T[] | symbol
  >;
};
