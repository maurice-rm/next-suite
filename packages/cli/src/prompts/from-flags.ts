import { hasConflictingFiles } from "@/core/fs-checks";
import { detectPackageManager } from "@/core/pm-detector";
import { resolveTarget } from "@/core/target";
import type {
  ConflictChoice,
  GithubActionsStep,
  ProjectConfig,
} from "@/core/types";
import { validateProjectInput, validateShadcnPreset } from "@/core/validation";
import {
  API_TYPES,
  AUTH_PROVIDERS,
  DATABASES,
  EMAIL_PROVIDERS,
  GITHUB_ACTIONS_STEP_ORDER,
  NGINX_MODES,
  ORMS,
  SHADCN_BASES,
} from "@/options";
import { PACKAGE_MANAGERS, type PackageManager } from "@/package-managers";

import { buildProjectConfig, type WizardAnswers } from "./build-config";

/** The CLI flags the non-interactive (`--yes`) path reads. */
interface CLIFlags {
  name?: string;
  pm?: string;
  tailwind?: boolean;
  shadcn?: boolean;
  shadcnBase?: string;
  shadcnPreset?: string;
  shadcnPointer?: boolean;
  database?: string;
  orm?: string;
  api?: string;
  openapi?: boolean;
  scalar?: boolean;
  auth?: string;
  email?: string;
  deployment?: string;
  githubActions?: string;
  git?: boolean;
  install?: boolean;
  overwrite?: boolean;
  empty?: boolean;
}

// Throws always; the `never` return type lets call sites `return fail(...)`, so
// TypeScript narrows control flow (and the result type) after the call.
const fail = (message: string): never => {
  throw new Error(message);
};

const NONE = "none";

const valuesOf = <T extends string>(options: readonly { value: T }[]): T[] =>
  options.map((option) => option.value);

const selectableValuesOf = <T extends string>(
  options: readonly { value: T }[],
): Exclude<T, typeof NONE>[] =>
  valuesOf(options).filter(
    (value): value is Exclude<T, typeof NONE> => value !== NONE,
  );

/**
 * Match a flag value against the accepted values of its dimension.
 *
 * @throws If `flag` is none of `choices`, naming the accepted values.
 */
const resolveChoice = <T extends string>(
  choices: readonly T[],
  flag: string,
  dimension: string,
): T => {
  const match = choices.find((choice) => choice === flag);
  if (match !== undefined) return match;
  return fail(
    `Unknown ${dimension} "${flag}" — expected one of ${choices.join(", ")}.`,
  );
};

const resolvePackageManager = (flag: string | undefined): PackageManager => {
  if (flag === undefined) return detectPackageManager() ?? "npm";
  return resolveChoice(
    PACKAGE_MANAGERS.map((manager) => manager.id),
    flag,
    "package manager",
  );
};

const resolveComponentLibrary = (
  flags: CLIFlags,
): Pick<
  WizardAnswers,
  "componentLibrary" | "tailwind" | "base" | "pointer" | "preset"
> => {
  if (!flags.shadcn) {
    return { componentLibrary: "none", tailwind: flags.tailwind ?? false };
  }
  return {
    componentLibrary: "shadcn",
    base:
      flags.shadcnBase === undefined
        ? SHADCN_BASES[0].value
        : resolveChoice(
            valuesOf(SHADCN_BASES),
            flags.shadcnBase,
            "shadcn base",
          ),
    pointer: flags.shadcnPointer ?? false,
    preset: flags.shadcnPreset,
  };
};

const resolveDatabase = (
  flags: CLIFlags,
): Pick<WizardAnswers, "database" | "orm"> => {
  if (flags.database === undefined && flags.orm === undefined) {
    return { database: NONE, orm: undefined };
  }
  if (flags.database === undefined || flags.orm === undefined) {
    return fail("--database and --orm must be passed together.");
  }
  return {
    database: resolveChoice(
      selectableValuesOf(DATABASES),
      flags.database,
      "database",
    ),
    orm: resolveChoice(valuesOf(ORMS), flags.orm, "ORM"),
  };
};

const resolveApi = (flag: string | undefined): Pick<WizardAnswers, "api"> => {
  if (flag === undefined) return { api: NONE };
  return { api: resolveChoice(selectableValuesOf(API_TYPES), flag, "api") };
};

const resolveOpenApi = (
  flags: CLIFlags,
): Pick<WizardAnswers, "openapi" | "scalar"> => {
  if (!flags.openapi) {
    if (flags.scalar) return fail("--scalar requires --openapi.");
    return { openapi: false, scalar: false };
  }
  if (flags.api !== "orpc") return fail("--openapi requires --api orpc.");
  return { openapi: true, scalar: flags.scalar ?? false };
};

const resolveAuth = (flags: CLIFlags): Pick<WizardAnswers, "auth"> => {
  if (flags.auth === undefined) return { auth: NONE };
  if (flags.database === undefined) {
    return fail(
      "--auth requires --database — Better-Auth needs a database adapter.",
    );
  }
  return {
    auth: resolveChoice(selectableValuesOf(AUTH_PROVIDERS), flags.auth, "auth"),
  };
};

const resolveEmail = (
  flag: string | undefined,
): Pick<WizardAnswers, "email"> => {
  if (flag === undefined) return { email: NONE };
  return {
    email: resolveChoice(selectableValuesOf(EMAIL_PROVIDERS), flag, "email"),
  };
};

const resolveDeployment = (
  flag: string | undefined,
): Pick<WizardAnswers, "production" | "nginxMode"> => {
  if (flag === undefined) return { production: false, nginxMode: undefined };
  return {
    production: true,
    nginxMode: resolveChoice(valuesOf(NGINX_MODES), flag, "deployment"),
  };
};

const parseGithubActionsSteps = (flag: string): GithubActionsStep[] => {
  const steps: GithubActionsStep[] = [];
  for (const requested of flag.split(",").map((step) => step.trim())) {
    if (requested.length === 0) continue;
    const match = GITHUB_ACTIONS_STEP_ORDER.find((step) => step === requested);
    if (!match) {
      return fail(
        `Unknown github-actions step "${requested}" — expected a comma-separated list of ${GITHUB_ACTIONS_STEP_ORDER.join(", ")}.`,
      );
    }
    steps.push(match);
  }
  return steps;
};

const resolveGithubActions = (
  flags: CLIFlags,
): Pick<WizardAnswers, "githubActionsEnabled" | "githubActionsSteps"> => {
  if (flags.githubActions === undefined) {
    return { githubActionsEnabled: false, githubActionsSteps: undefined };
  }
  const steps = parseGithubActionsSteps(flags.githubActions);
  if (
    steps.some((step) => step === "image" || step === "deploy") &&
    flags.deployment === undefined
  ) {
    return fail("--github-actions image/deploy requires --deployment.");
  }
  return {
    githubActionsEnabled: steps.length > 0,
    githubActionsSteps: steps,
  };
};

const requireValidInput = (name: string | undefined): string => {
  const input = name?.trim();
  if (!input) {
    return fail(
      "A project name is required in --yes mode — pass it as the argument.",
    );
  }
  const error = validateProjectInput(input);
  if (error) return fail(error);
  return input;
};

const assertCompatibleFlags = (flags: CLIFlags): void => {
  if (flags.overwrite && flags.empty) {
    fail("--overwrite and --empty are mutually exclusive — pass only one.");
  }
  const hasShadcnOptions =
    flags.shadcnBase !== undefined ||
    flags.shadcnPreset !== undefined ||
    flags.shadcnPointer !== undefined;
  if (!flags.shadcn && hasShadcnOptions) {
    fail(
      "--shadcn-base, --shadcn-preset, and --shadcn-pointer require --shadcn.",
    );
  }
  const presetError = flags.shadcn
    ? validateShadcnPreset(flags.shadcnPreset)
    : undefined;
  if (presetError) fail(`Invalid --shadcn-preset: ${presetError}`);
};

const resolveConflictAction = async (
  input: string,
  flags: CLIFlags,
): Promise<ConflictChoice | undefined> => {
  if (!(await hasConflictingFiles(resolveTarget(input).targetDir))) {
    return undefined;
  }
  if (flags.overwrite) return "overwrite";
  if (flags.empty) return "empty";
  return fail(
    `"${input}" already has conflicting files — pass --overwrite or --empty to proceed.`,
  );
};

/**
 * Build a fully-resolved ProjectConfig from `--yes`-mode flags, defaulting
 * everything omitted — the non-interactive counterpart to the wizard. It runs
 * the same validation (`validateProjectInput`) and conflict detection, then
 * reuses {@link buildProjectConfig} so all the narrowing lives in one place.
 *
 * @throws If the name is missing or invalid, the target has conflicting files
 *   without an override flag, a flag names an unknown value, or two flags
 *   contradict each other.
 */
export const configFromFlags = async (
  flags: CLIFlags,
): Promise<ProjectConfig> => {
  const input = requireValidInput(flags.name);
  assertCompatibleFlags(flags);

  const answers: WizardAnswers = {
    input,
    action: await resolveConflictAction(input, flags),
    ...resolveComponentLibrary(flags),
    ...resolveDatabase(flags),
    ...resolveApi(flags.api),
    ...resolveOpenApi(flags),
    ...resolveAuth(flags),
    ...resolveEmail(flags.email),
    ...resolveDeployment(flags.deployment),
    ...resolveGithubActions(flags),
    git: flags.git ?? true,
    packageManager: resolvePackageManager(flags.pm),
    install: flags.install ?? true,
  };

  return buildProjectConfig(answers);
};
