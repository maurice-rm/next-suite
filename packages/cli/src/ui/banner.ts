import ansis from "ansis";

import type { VersionStatus } from "@/core/version-check";

import { brand, LINK } from "./style";

const TITLE_LINES = [
  "███╗   ██╗███████╗██╗  ██╗████████╗    ███████╗██╗   ██╗██║████████╗███████╗",
  "████╗  ██║██╔════╝╚██╗██╔╝╚══██╔══╝    ██╔════╝██║   ██║██║╚══██╔══╝██╔════╝",
  "██╔██╗ ██║█████╗   ╚███╔╝    ██║       ███████╗██║   ██║██║   ██║   █████╗",
  "██║╚██╗██║██╔══╝   ██╔██╗    ██║       ╚════██║██║   ██║██║   ██║   ██╔══╝",
  "██║ ╚████║███████╗██╔╝ ██╗   ██║       ███████║╚██████╔╝██║   ██║   ███████╗",
  "╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝   ╚═╝       ╚══════╝ ╚═════╝ ╚═╝   ╚═╝   ╚══════╝",
];

/** Column where "SUITE" begins; the wordmark is two-tone across this split. */
const SPLIT = 37;
const DEFAULT_TERMINAL_COLUMNS = 80;
const META_SEPARATOR = "  ·  ";
const TAGLINE = "A better starting point for Next.js.";
const WIDTH = Math.max(...TITLE_LINES.map((line) => line.length));

const renderWordmark = (): string =>
  TITLE_LINES.map(
    (line) => brand.bold(line.slice(0, SPLIT)) + ansis.bold(line.slice(SPLIT)),
  ).join("\n");

const renderTagline = (): string =>
  ansis.dim("A better starting point for ") + brand.bold("Next.js.");

export const renderVersionPart = (
  version: string,
  status: VersionStatus,
): { plain: string; styled: string } => {
  const tag = `v${version}`;
  switch (status.state) {
    case "latest":
      return {
        plain: `${tag} (latest)`,
        styled: ansis.bold(tag) + brand.bold(" (latest)"),
      };
    case "outdated":
      return {
        plain: `${tag} (update available → v${status.latest})`,
        styled:
          ansis.bold(tag) +
          ansis.dim(" (update available → ") +
          brand.bold(`v${status.latest}`) +
          ansis.dim(")"),
      };
    default:
      return { plain: tag, styled: ansis.bold(tag) };
  }
};

export const buildMetaStrip = (
  version: string,
  status: VersionStatus,
): { plain: string; styled: string } => {
  const parts = [
    renderVersionPart(version, status),
    { plain: LINK, styled: brand(LINK) },
  ];
  return {
    plain: parts.map((part) => part.plain).join(META_SEPARATOR),
    styled: parts.map((part) => part.styled).join(ansis.dim(META_SEPARATOR)),
  };
};

export const centerText = (
  styled: string,
  visibleLength: number,
  width: number,
): string =>
  " ".repeat(Math.max(0, Math.floor((width - visibleLength) / 2))) + styled;

/**
 * Print the next-suite banner: a two-tone ASCII wordmark, the centered tagline,
 * and a meta strip (version status and repo link) — or a compact variant on
 * narrow terminals.
 */
export const renderTitle = (
  version: string,
  status: VersionStatus = { state: "unknown" },
): void => {
  const columns = process.stdout.columns || DEFAULT_TERMINAL_COLUMNS;
  if (columns < WIDTH) {
    const versionPart = renderVersionPart(version, status);
    console.log();
    console.log(
      centerText(
        brand.bold("next") + ansis.bold("-suite"),
        "next-suite".length,
        columns,
      ),
    );
    console.log();
    console.log(centerText(renderTagline(), TAGLINE.length, columns));
    console.log();
    console.log(
      centerText(versionPart.styled, versionPart.plain.length, columns),
    );
    console.log();
    console.log();
    return;
  }
  console.log();
  console.log(renderWordmark());
  console.log();
  console.log(centerText(renderTagline(), TAGLINE.length, WIDTH));
  console.log();
  const strip = buildMetaStrip(version, status);
  console.log(centerText(strip.styled, strip.plain.length, WIDTH));
  console.log();
  console.log();
};
