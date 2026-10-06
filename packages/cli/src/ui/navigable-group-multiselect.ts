import { GroupMultiSelectPrompt, type State } from "@clack/core";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";

import { withGoBack } from "./go-back";
import type { NavigableOption } from "./navigable-select";
import {
  brand,
  multiselectFooter,
  renderPromptTitle,
  renderResolved,
} from "./style";

// GroupMultiSelectPrompt flattens the groups into one list, tagging each entry
// with `group`: `true` for a header row, or the group name for an item.
type GroupFlatOption<T> = NavigableOption<T> & { group: string | boolean };

interface GroupMultiRenderState<T> {
  state: State;
  cursor: number;
  options: GroupFlatOption<T>[];
  value?: T[];
}

const renderCheckbox = (isChecked: boolean): string =>
  isChecked ? brand(SYMBOLS.checkboxOn) : ansis.dim(SYMBOLS.checkboxOff);

const renderGroupHeader = <T>(
  self: GroupMultiRenderState<T>,
  header: GroupFlatOption<T>,
  index: number,
): string => {
  const selected = self.value ?? [];
  const items = self.options.filter((option) => option.group === header.value);
  const isGroupSelected =
    items.length > 0 && items.every((item) => selected.includes(item.value));
  const label =
    index === self.cursor ? ansis.bold(header.label) : ansis.dim(header.label);
  return `${renderCheckbox(isGroupSelected)} ${label}`;
};

const renderGroupItem = <T>(
  self: GroupMultiRenderState<T>,
  item: GroupFlatOption<T>,
  index: number,
): string => {
  const selected = self.value ?? [];
  const isLast =
    index === self.options.length - 1 ||
    self.options[index + 1]?.group === true;
  const connector = ansis.dim(isLast ? SYMBOLS.barEnd : SYMBOLS.bar);
  const label = index === self.cursor ? item.label : ansis.dim(item.label);
  const hint = item.hint ? ` ${ansis.dim(`(${item.hint})`)}` : "";
  return `${connector} ${renderCheckbox(selected.includes(item.value))} ${label}${hint}`;
};

const renderGroupMultiselect = <T>(
  self: GroupMultiRenderState<T>,
  message: string,
  canGoBack: boolean,
): string => {
  const title = renderPromptTitle(self.state, message);

  if (self.state === "submit" || self.state === "cancel") {
    const selected = self.value ?? [];
    const labels = self.options
      .filter(
        (option) => option.group !== true && selected.includes(option.value),
      )
      .map((option) => option.label);
    return renderResolved(title, self.state, labels.join(", ") || "none");
  }

  const list = self.options
    .map((option, index) =>
      option.group === true
        ? renderGroupHeader(self, option, index)
        : renderGroupItem(self, option, index),
    )
    .join(`\n${brand(SYMBOLS.bar)}  `);

  return `${title}${brand(SYMBOLS.bar)}  ${list}\n${brand(SYMBOLS.barEnd)}\n   ${multiselectFooter(canGoBack)}\n`;
};

interface NavigableGroupMultiselectOptions<T> {
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
  options: NavigableGroupMultiselectOptions<T>,
): Promise<T[] | symbol> => {
  const canGoBack = options.canGoBack ?? false;
  const prompt = new GroupMultiSelectPrompt<NavigableOption<T>>({
    options: options.options,
    initialValues: options.initialValues,
    selectableGroups: true,
    required: false,
    render() {
      return renderGroupMultiselect(this, options.message, canGoBack);
    },
  });
  return withGoBack(prompt, canGoBack, (char) => char === "b") as Promise<
    T[] | symbol
  >;
};
