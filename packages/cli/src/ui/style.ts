import type { State } from "@clack/core";
import ansis from "ansis";

import { BRAND, SYMBOLS } from "@/branding";

import pkg from "../../package.json";

export const brand = ansis.hex(BRAND);

export const pick = ansis.hex("#a3e635");

/** The docs link shown in the banner and outro, derived so it can't drift from package.json. */
export const LINK = pkg.homepage
  .replace(/^https?:\/\//, "")
  .replace(/#.*$/, "");

export const stateGlyph = (state: State): string => {
  switch (state) {
    case "submit":
      return pick(SYMBOLS.submit);
    case "cancel":
      return ansis.red(SYMBOLS.cancel);
    case "error":
      return ansis.yellow(SYMBOLS.error);
    default:
      return brand(SYMBOLS.active);
  }
};

const hint = (entries: [key: string, label: string][]): string =>
  ansis.dim(
    entries.map(([key, label]) => `${ansis.gray(key)} ${label}`).join(" • "),
  );

const backEntry = (key: string, canGoBack: boolean): [string, string][] =>
  canGoBack ? [[key, "back"]] : [];

export const textFooter = (canGoBack: boolean): string =>
  hint([
    ["enter", "confirm"],
    ...backEntry("esc", canGoBack),
    ["ctrl+c", "cancel"],
  ]);

export const selectFooter = (canGoBack: boolean): string =>
  hint([
    ["↑/↓", "navigate"],
    ["enter", "confirm"],
    ...backEntry("b", canGoBack),
    ["ctrl+c", "cancel"],
  ]);

export const confirmFooter = (canGoBack: boolean): string =>
  hint([
    ["←/→", "toggle"],
    ["y/n", "select"],
    ["enter", "confirm"],
    ...backEntry("b", canGoBack),
    ["ctrl+c", "cancel"],
  ]);

export const multiselectFooter = (canGoBack: boolean): string =>
  hint([
    ["↑/↓", "navigate"],
    ["space", "toggle"],
    ["enter", "confirm"],
    ...backEntry("b", canGoBack),
    ["ctrl+c", "cancel"],
  ]);
