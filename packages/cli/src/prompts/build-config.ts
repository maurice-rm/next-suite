import { resolveTarget } from "@/core/target";
import type {
  ApiConfig,
  ApiType,
  Auth,
  ComponentLibrary,
  ConflictChoice,
  DatabaseChoice,
  DatabaseOptions,
  EmailProvider,
  GithubActionsStep,
  NginxMode,
  OpenApiOptions,
  Orm,
  ProductionOptions,
  ProjectConfig,
  ShadcnBase,
  ShadcnOptions,
} from "@/core/types";
import { GITHUB_ACTIONS_STEP_ORDER } from "@/options";
import type { PackageManager } from "@/package-managers";
import { required } from "@/wizard";

/**
 * The raw per-step answers the wizard accumulates — a partial, optional-keyed
 * mirror of the prompts, before {@link buildProjectConfig} validates and narrows
 * it into a {@link ProjectConfig}.
 */
export interface WizardAnswers {
  input: string;
  /** Absent when no conflict was detected → the final action becomes "create". */
  action?: ConflictChoice;
  componentLibrary: ComponentLibrary;
  /** Only asked when no component library is chosen; shadcn/ui bundles Tailwind. */
  tailwind?: boolean;
  /** base/pointer/preset are only asked when componentLibrary === "shadcn". */
  base?: ShadcnBase;
  pointer?: boolean;
  preset?: string;
  database?: DatabaseChoice;
  orm?: Orm;
  api?: ApiType;
  /** OpenAPI layer for oRPC — only asked when api === "orpc". */
  openapi?: boolean;
  /** Scalar docs UI — only asked when openapi is enabled. */
  scalar?: boolean;
  auth?: Auth;
  email?: EmailProvider;
  production?: boolean;
  nginxMode?: NginxMode;
  githubActionsEnabled?: boolean;
  githubActionsSteps?: GithubActionsStep[];
  git?: boolean;
  packageManager?: PackageManager;
  install?: boolean;
  quickStart?: boolean;
}

const toShadcnOptions = (a: Partial<WizardAnswers>): ShadcnOptions => ({
  base: required(a.base, "base"),
  pointer: required(a.pointer, "pointer"),
  preset: a.preset?.trim() || undefined,
});

const toDatabaseOptions = (
  a: Partial<WizardAnswers>,
): DatabaseOptions | undefined => {
  const choice = required(a.database, "database");
  if (choice === "none") return undefined;
  return { engine: choice, orm: required(a.orm, "orm") };
};

const toOpenApiOptions = (
  a: Partial<WizardAnswers>,
): OpenApiOptions | undefined =>
  a.openapi ? { scalar: !!a.scalar } : undefined;

const toApiConfig = (a: Partial<WizardAnswers>): ApiConfig | undefined => {
  const type = required(a.api, "api");
  if (type === "none") return undefined;
  if (type === "trpc") return { type: "trpc" };
  return { type: "orpc", openapi: toOpenApiOptions(a) };
};

const toProductionOptions = (
  a: Partial<WizardAnswers>,
): ProductionOptions | undefined =>
  a.production ? { mode: required(a.nginxMode, "nginx mode") } : undefined;

const toGithubActions = (a: Partial<WizardAnswers>): GithubActionsStep[] => {
  if (!a.githubActionsEnabled) return [];
  const steps = new Set(a.githubActionsSteps ?? []);
  if (steps.has("deploy")) steps.add("image");
  return GITHUB_ACTIONS_STEP_ORDER.filter((step) => steps.has(step));
};

/**
 * Assemble the final ProjectConfig from the collected wizard answers. Pure
 * (aside from resolving the target against the cwd): it unwraps the answers an
 * unconditional step must have produced, throwing via `required` if a wizard
 * invariant was violated.
 */
export const buildProjectConfig = (
  answers: Partial<WizardAnswers>,
): ProjectConfig => {
  const { targetDir, projectName } = resolveTarget(
    required(answers.input, "project input"),
  );

  if (answers.quickStart) {
    return {
      projectName,
      targetDir,
      action: answers.action ?? "create",
      componentLibrary: "none",
      tailwind: true,
      shadcn: undefined,
      database: undefined,
      api: undefined,
      auth: "none",
      email: "none",
      production: undefined,
      githubActions: [],
      git: true,
      packageManager: required(answers.packageManager, "package manager"),
      install: true,
    };
  }

  const componentLibrary = required(
    answers.componentLibrary,
    "component library",
  );
  const isShadcn = componentLibrary === "shadcn";
  return {
    projectName,
    targetDir,
    action: answers.action ?? "create",
    componentLibrary,
    tailwind: isShadcn ? true : required(answers.tailwind, "tailwind"),
    shadcn: isShadcn ? toShadcnOptions(answers) : undefined,
    database: toDatabaseOptions(answers),
    api: toApiConfig(answers),
    auth: answers.auth ?? "none",
    email: required(answers.email, "email"),
    production: toProductionOptions(answers),
    githubActions: toGithubActions(answers),
    git: required(answers.git, "git"),
    packageManager: required(answers.packageManager, "package manager"),
    install: required(answers.install, "install"),
  };
};
