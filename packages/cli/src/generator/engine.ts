import Handlebars from "handlebars";

import type { ProjectConfig } from "@/core/types";
import { isCdStep } from "@/options";
import { findPackageManagerEntry } from "@/package-managers";

import { ACCEPTED_ADVISORIES } from "./config/advisories";
import { type DependencyName, VERSIONS } from "./config/dependencies";
import { dependencyOverrides } from "./resolve";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isProjectConfig = (value: unknown): value is ProjectConfig =>
  typeof value === "object" &&
  value !== null &&
  "projectName" in value &&
  typeof value.projectName === "string" &&
  "packageManager" in value &&
  typeof value.packageManager === "string" &&
  "githubActions" in value &&
  Array.isArray(value.githubActions);

const readRootConfig = (options: Handlebars.HelperOptions): ProjectConfig => {
  const data: unknown = options.data;
  const root =
    typeof data === "object" && data !== null && "root" in data
      ? data.root
      : undefined;
  if (!isProjectConfig(root)) {
    throw new Error("Template data is not a project configuration.");
  }
  return root;
};

const getExecPrefix = (packageManager: unknown): string => {
  const entry =
    typeof packageManager === "string"
      ? findPackageManagerEntry(packageManager)
      : undefined;
  if (!entry) {
    throw new Error(`Unknown package manager: ${String(packageManager)}.`);
  }
  return entry.exec;
};

const isDependencyName = (value: unknown): value is DependencyName =>
  typeof value === "string" && Object.hasOwn(VERSIONS, value);

const getCatalogVersion = (name: unknown): string => {
  if (!isDependencyName(name)) {
    throw new Error(`Unknown catalog dependency: ${String(name)}.`);
  }
  return VERSIONS[name];
};

const dropHelperOptions = (args: unknown[]): unknown[] => args.slice(0, -1);

Handlebars.registerHelper(
  "eq",
  (left: unknown, right: unknown) => left === right,
);
Handlebars.registerHelper(
  "ne",
  (left: unknown, right: unknown) => left !== right,
);
Handlebars.registerHelper("not", (value: unknown) => !value);
Handlebars.registerHelper("and", (...args: unknown[]) =>
  dropHelperOptions(args).every(Boolean),
);
Handlebars.registerHelper("or", (...args: unknown[]) =>
  dropHelperOptions(args).some(Boolean),
);
Handlebars.registerHelper(
  "includes",
  (list: unknown, value: unknown) =>
    Array.isArray(list) && list.includes(value),
);
// Derived from the step registries so a new step cannot leave a template stale.
Handlebars.registerHelper(
  "hasCiStep",
  (steps: unknown) =>
    isStringArray(steps) && steps.some((step) => !isCdStep(step)),
);
Handlebars.registerHelper(
  "hasCdStep",
  (steps: unknown) => isStringArray(steps) && steps.some(isCdStep),
);
// Emit the block body verbatim — lets templates contain literal `{{ }}` (e.g.
// GitHub Actions `${{ }}` expressions) that Handlebars would otherwise consume.
Handlebars.registerHelper("raw", (options: Handlebars.HelperOptions) =>
  options.fn(undefined),
);
Handlebars.registerHelper("acceptedAdvisories", () =>
  ACCEPTED_ADVISORIES.map((advisory) => advisory.id),
);
Handlebars.registerHelper(
  "dependencyOverrides",
  (options: Handlebars.HelperOptions) =>
    Object.entries(dependencyOverrides(readRootConfig(options))).map(
      ([name, version]) => ({ name, version }),
    ),
);
Handlebars.registerHelper("acceptedNpmAdvisories", () =>
  ACCEPTED_ADVISORIES.map((advisory) => advisory.npmAdvisoryId),
);
Handlebars.registerHelper("execPrefix", getExecPrefix);
// For pinned versions a template writes outside package.json (a CDN URL).
Handlebars.registerHelper("catalogVersion", getCatalogVersion);

/**
 * Render a Handlebars template string with the given data. HTML escaping is
 * disabled because we generate source code, not HTML.
 */
export const renderString = (content: string, data: unknown): string =>
  Handlebars.compile(content, { noEscape: true })(data);
