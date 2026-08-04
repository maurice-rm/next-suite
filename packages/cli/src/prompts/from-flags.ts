import { hasConflictingFiles } from "@/core/fs-checks";
import { detectPackageManager } from "@/core/pm-detector";
import { resolveTarget } from "@/core/target";
import type {
  ConflictChoice,
  GithubActionsStep,
  ProjectConfig,
  ShadcnBase,
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
import {
  findPackageManagerEntry,
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@/package-managers";

import { buildProjectConfig, type WizardAnswers } from "./build-config";

/** The CLI flags the non-interactive (`--yes`) path reads. */
export interface CLIFlags {
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

const resolvePackageManager = (flag: string | undefined): PackageManager => {
  if (flag === undefined) return detectPackageManager() ?? "npm";
  const entry = findPackageManagerEntry(flag);
  if (entry) return entry.id;
  return fail(
    `Unknown package manager "${flag}" — expected one of ${PACKAGE_MANAGERS.map((pm) => pm.id).join(", ")}.`,
  );
};

const resolveShadcnBase = (flag: string | undefined): ShadcnBase => {
  if (flag !== undefined) {
    const match = SHADCN_BASES.find((base) => base.value === flag);
    if (match) return match.value;
    return fail(
      `Unknown shadcn base "${flag}" — expected one of ${SHADCN_BASES.map((base) => base.value).join(", ")}.`,
    );
  }
  const fallback = SHADCN_BASES[0];
  if (fallback) return fallback.value;
  return fail("SHADCN_BASES must not be empty.");
};

const resolveDatabase = (
  flags: CLIFlags,
): Pick<WizardAnswers, "database" | "orm"> => {
  if (flags.database === undefined && flags.orm === undefined) {
    return { database: "none", orm: undefined };
  }
  if (flags.database === undefined || flags.orm === undefined) {
    return fail("--database and --orm must be passed together.");
  }
  const database = DATABASES.find(
    (entry) => entry.value !== "none" && entry.value === flags.database,
  );
  if (!database) {
    return fail(
      `Unknown database "${flags.database}" — expected one of ${DATABASES.filter(
        (entry) => entry.value !== "none",
      )
        .map((entry) => entry.value)
        .join(", ")}.`,
    );
  }
  const orm = ORMS.find((entry) => entry.value === flags.orm);
  if (!orm) {
    return fail(
      `Unknown ORM "${flags.orm}" — expected one of ${ORMS.map(
        (entry) => entry.value,
      ).join(", ")}.`,
    );
  }
  return { database: database.value, orm: orm.value };
};

const resolveApi = (flag: string | undefined): Pick<WizardAnswers, "api"> => {
  if (flag === undefined) return { api: "none" };
  const api = API_TYPES.find(
    (entry) => entry.value !== "none" && entry.value === flag,
  );
  if (!api) {
    return fail(
      `Unknown api "${flag}" — expected one of ${API_TYPES.filter(
        (entry) => entry.value !== "none",
      )
        .map((entry) => entry.value)
        .join(", ")}.`,
    );
  }
  return { api: api.value };
};

const resolveOpenApi = (
  flags: CLIFlags,
): Pick<WizardAnswers, "openapi" | "scalar"> => {
  if (!flags.openapi) {
    if (flags.scalar) return fail("--scalar requires --openapi.");
    return { openapi: false, scalar: false };
  }
  if (flags.api !== "orpc") return fail("--openapi requires --api orpc.");
  return { openapi: true, scalar: !!flags.scalar };
};

const resolveAuth = (flags: CLIFlags): Pick<WizardAnswers, "auth"> => {
  if (flags.auth === undefined) return { auth: "none" };
  if (flags.database === undefined) {
    return fail(
      "--auth requires --database — Better-Auth needs a database adapter.",
    );
  }
  const auth = AUTH_PROVIDERS.find(
    (entry) => entry.value !== "none" && entry.value === flags.auth,
  );
  if (!auth) {
    return fail(
      `Unknown auth "${flags.auth}" — expected one of ${AUTH_PROVIDERS.filter(
        (entry) => entry.value !== "none",
      )
        .map((entry) => entry.value)
        .join(", ")}.`,
    );
  }
  return { auth: auth.value };
};

const resolveEmail = (flags: CLIFlags): Pick<WizardAnswers, "email"> => {
  if (flags.email === undefined) return { email: "none" };
  const email = EMAIL_PROVIDERS.find(
    (entry) => entry.value !== "none" && entry.value === flags.email,
  );
  if (!email) {
    return fail(
      `Unknown email "${flags.email}" — expected one of ${EMAIL_PROVIDERS.filter(
        (entry) => entry.value !== "none",
      )
        .map((entry) => entry.value)
        .join(", ")}.`,
    );
  }
  return { email: email.value };
};

const resolveDeployment = (
  flags: CLIFlags,
): Pick<WizardAnswers, "production" | "nginxMode"> => {
  if (flags.deployment === undefined) {
    return { production: false, nginxMode: undefined };
  }
  const mode = NGINX_MODES.find((entry) => entry.value === flags.deployment);
  if (!mode) {
    return fail(
      `Unknown deployment "${flags.deployment}" — expected one of ${NGINX_MODES.map(
        (entry) => entry.value,
      ).join(", ")}.`,
    );
  }
  return { production: true, nginxMode: mode.value };
};

const resolveGithubActions = (
  flags: CLIFlags,
): Pick<WizardAnswers, "githubActionsEnabled" | "githubActionsSteps"> => {
  if (flags.githubActions === undefined) {
    return { githubActionsEnabled: false, githubActionsSteps: undefined };
  }
  const steps: GithubActionsStep[] = [];
  for (const requested of flags.githubActions.split(",").map((s) => s.trim())) {
    if (requested.length === 0) continue;
    const match = GITHUB_ACTIONS_STEP_ORDER.find((step) => step === requested);
    if (!match) {
      return fail(
        `Unknown github-actions step "${requested}" — expected a comma-separated list of ${GITHUB_ACTIONS_STEP_ORDER.join(", ")}.`,
      );
    }
    steps.push(match);
  }
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

/**
 * Build a fully-resolved ProjectConfig from `--yes`-mode flags, defaulting
 * everything omitted — the non-interactive counterpart to the wizard. It runs
 * the same validation (`validateProjectInput`) and conflict detection, then
 * reuses {@link buildProjectConfig} so all the narrowing lives in one place.
 *
 * @param flags - The parsed CLI flags.
 * @returns The resolved {@link ProjectConfig}.
 * @throws If the name is missing or invalid, the target has conflicting files
 *   without an override flag, or `--pm`/`--shadcn-base` name an unknown value.
 */
export const configFromFlags = async (
  flags: CLIFlags,
): Promise<ProjectConfig> => {
  const input = flags.name?.trim();
  if (!input) {
    return fail(
      "A project name is required in --yes mode — pass it as the argument.",
    );
  }

  const error = validateProjectInput(input);
  if (error) return fail(error);

  if (flags.overwrite && flags.empty) {
    return fail(
      "--overwrite and --empty are mutually exclusive — pass only one.",
    );
  }

  const isShadcn = flags.shadcn === true;
  if (
    !isShadcn &&
    (flags.shadcnBase !== undefined ||
      flags.shadcnPreset !== undefined ||
      flags.shadcnPointer !== undefined)
  ) {
    return fail(
      "--shadcn-base, --shadcn-preset, and --shadcn-pointer require --shadcn.",
    );
  }
  if (isShadcn) {
    const presetError = validateShadcnPreset(flags.shadcnPreset);
    if (presetError) return fail(`Invalid --shadcn-preset: ${presetError}`);
  }

  const { targetDir } = resolveTarget(input);
  let action: ConflictChoice | undefined;
  if (await hasConflictingFiles(targetDir)) {
    if (flags.overwrite) action = "overwrite";
    else if (flags.empty) action = "empty";
    else {
      return fail(
        `"${input}" already has conflicting files — pass --overwrite or --empty to proceed.`,
      );
    }
  }

  const answers: WizardAnswers = {
    input,
    action,
    componentLibrary: isShadcn ? "shadcn" : "none",
    tailwind: isShadcn ? undefined : (flags.tailwind ?? false),
    base: isShadcn ? resolveShadcnBase(flags.shadcnBase) : undefined,
    pointer: isShadcn ? (flags.shadcnPointer ?? false) : undefined,
    preset: isShadcn ? flags.shadcnPreset : undefined,
    ...resolveDatabase(flags),
    ...resolveApi(flags.api),
    ...resolveOpenApi(flags),
    ...resolveAuth(flags),
    ...resolveEmail(flags),
    ...resolveDeployment(flags),
    ...resolveGithubActions(flags),
    git: flags.git ?? true,
    packageManager: resolvePackageManager(flags.pm),
    install: flags.install ?? true,
  };

  return buildProjectConfig(answers);
};
