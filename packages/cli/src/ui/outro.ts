import * as p from "@clack/prompts";
import ansis from "ansis";

import { SYMBOLS } from "@/branding";
import type { ProjectConfig } from "@/core/types";
import {
  API_TYPES,
  AUTH_PROVIDERS,
  COMPONENT_LIBRARIES,
  DATABASES,
  EMAIL_PROVIDERS,
  ORMS,
} from "@/options";
import type { PackageManager } from "@/package-managers";

import { nextSteps } from "./next-steps";
import { brand, LINK, pick } from "./style";

/**
 * What the closing summary shows, derived purely from the config so it can be
 * asserted without parsing ANSI output. `stack` mirrors the wizard selections,
 * with each label read from `options.ts` — so adding an option there needs no
 * change here. It reflects what was *chosen*.
 */
export interface OutroSummary {
  projectName: string;
  stack: string[];
  packageManager: PackageManager;
  steps: string[];
}

/** Resolve a selected value to its `options.ts` label, skipping unset/"none". */
const labelOf = (
  options: readonly { value: string; label: string }[],
  value: string | undefined,
): string | undefined =>
  value && value !== "none"
    ? options.find((option) => option.value === value)?.label
    : undefined;

export const buildSummary = (config: ProjectConfig): OutroSummary => {
  const stack = [
    "Next.js",
    "TypeScript",
    config.tailwind ? "Tailwind" : undefined,
    labelOf(COMPONENT_LIBRARIES, config.componentLibrary),
    labelOf(DATABASES, config.database?.engine),
    labelOf(ORMS, config.database?.orm),
    labelOf(API_TYPES, config.api?.type),
    labelOf(AUTH_PROVIDERS, config.auth),
    labelOf(EMAIL_PROVIDERS, config.email),
    config.production ? "nginx" : undefined,
    config.githubActions.length ? "CI/CD" : undefined,
  ].filter((label): label is string => label !== undefined);
  return {
    projectName: config.projectName,
    stack,
    packageManager: config.packageManager,
    steps: nextSteps(config),
  };
};

const dot = ansis.dim(" · ");

/** Color the leading package-manager token of a command; leave the rest plain. */
const highlightCommand = (command: string, pm: PackageManager): string =>
  command.startsWith(`${pm} `) ? brand(pm) + command.slice(pm.length) : command;

/**
 * Print the closing summary panel: a branded title, the scaffolded stack, the
 * next-step commands, and a docs link.
 */
export const renderOutro = (config: ProjectConfig): void => {
  const summary = buildSummary(config);
  const bar = ansis.gray(SYMBOLS.bar);
  const row = (content = ""): void =>
    console.log(content ? `${bar}  ${content}` : bar);

  row();
  console.log(
    `${pick(SYMBOLS.submit)}  ${brand.bold(summary.projectName)} is ready`,
  );
  console.log(`${bar}   ${brand(SYMBOLS.corner)} ${summary.stack.join(dot)}`);
  row();
  row(ansis.bold("Next steps"));
  for (const step of summary.steps) {
    row(`  ${highlightCommand(step, summary.packageManager)}`);
  }
  p.outro(`Docs ${brand("→")} ${brand(LINK)}`);
};

/** {@link renderOutro}'s minimal sibling for the server commands. */
export const renderProvisionOutro = (
  title: string,
  lines: string[] = [],
): void => {
  const bar = ansis.gray(SYMBOLS.bar);
  const row = (content = ""): void =>
    console.log(content ? `${bar}  ${content}` : bar);

  row();
  console.log(`${pick(SYMBOLS.submit)}  ${brand.bold(title)}`);
  for (const line of lines) row(line);
  row();
  p.outro(`Docs ${brand("→")} ${brand(LINK)}`);
};
