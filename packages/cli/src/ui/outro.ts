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
interface OutroSummary {
  projectName: string;
  stack: string[];
  packageManager: PackageManager;
  steps: string[];
}

/** Resolve a selected value to its `options.ts` label, skipping unset/"none". */
const findLabel = (
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
    findLabel(COMPONENT_LIBRARIES, config.shadcn ? "shadcn" : undefined),
    findLabel(DATABASES, config.database?.engine),
    findLabel(ORMS, config.database?.orm),
    findLabel(API_TYPES, config.api?.type),
    findLabel(AUTH_PROVIDERS, config.auth),
    findLabel(EMAIL_PROVIDERS, config.email),
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

const STACK_SEPARATOR = ansis.dim(" · ");

/** Color the leading package-manager token of a command; leave the rest plain. */
const highlightCommand = (
  command: string,
  packageManager: PackageManager,
): string =>
  command.startsWith(`${packageManager} `)
    ? brand(packageManager) + command.slice(packageManager.length)
    : command;

const printRow = (content = ""): void => {
  const bar = ansis.gray(SYMBOLS.bar);
  console.log(content ? `${bar}  ${content}` : bar);
};

const printDocsOutro = (): void => {
  p.outro(`Docs ${brand("→")} ${brand(LINK)}`);
};

/**
 * Print the closing summary panel: a branded title, the scaffolded stack, the
 * next-step commands, and a docs link.
 */
export const renderOutro = (config: ProjectConfig): void => {
  const summary = buildSummary(config);

  printRow();
  console.log(
    `${pick(SYMBOLS.submit)}  ${brand.bold(summary.projectName)} is ready`,
  );
  console.log(
    `${ansis.gray(SYMBOLS.bar)}   ${brand(SYMBOLS.corner)} ${summary.stack.join(STACK_SEPARATOR)}`,
  );
  printRow();
  printRow(ansis.bold("Next steps"));
  for (const step of summary.steps) {
    printRow(`  ${highlightCommand(step, summary.packageManager)}`);
  }
  printDocsOutro();
};

/** {@link renderOutro}'s minimal sibling for the server commands. */
export const renderProvisionOutro = (
  title: string,
  lines: string[] = [],
): void => {
  printRow();
  console.log(`${pick(SYMBOLS.submit)}  ${brand.bold(title)}`);
  for (const line of lines) printRow(line);
  printRow();
  printDocsOutro();
};
