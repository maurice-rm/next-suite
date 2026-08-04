import {
  API_TYPES,
  AUTH_PROVIDERS,
  COMPONENT_LIBRARIES,
  DATABASES,
  EMAIL_PROVIDERS,
  GITHUB_ACTIONS_CD_STEPS,
  GITHUB_ACTIONS_CI_STEPS,
  NGINX_MODES,
  ORMS,
  SHADCN_BASES,
} from "@/options";
import type { PackageManager } from "@/package-managers";

export type ConflictAction = "create" | "overwrite" | "empty";

export type ConflictChoice = Exclude<ConflictAction, "create">;

export type ComponentLibrary = (typeof COMPONENT_LIBRARIES)[number]["value"];

/** Primitives library shadcn/ui builds on (maps to shadcn's `--base` flag). */
export type ShadcnBase = (typeof SHADCN_BASES)[number]["value"];

/** shadcn/ui-specific options, collected only when it is the chosen library. */
export interface ShadcnOptions {
  base: ShadcnBase;
  /** shadcn's `--pointer` flag — adds `cursor: pointer` to interactive elements. */
  pointer: boolean;
  /** shadcn/create preset code passed as `--preset`. */
  preset?: string;
}

export type DatabaseChoice = (typeof DATABASES)[number]["value"];

export type DatabaseEngine = Exclude<DatabaseChoice, "none">;

export type Orm = (typeof ORMS)[number]["value"];

/** Database engine + ORM, collected only when a database is chosen. */
export interface DatabaseOptions {
  engine: DatabaseEngine;
  orm: Orm;
}

export type ApiType = (typeof API_TYPES)[number]["value"];

/** OpenAPI-generation options for an oRPC project, collected only when enabled. */
export interface OpenApiOptions {
  scalar: boolean;
}

/**
 * The resolved API layer (undefined = "none"). A discriminated union so each
 * flavour can carry its own options — oRPC optionally carries OpenAPI settings.
 */
export type ApiConfig =
  { type: "trpc" } | { type: "orpc"; openapi?: OpenApiOptions };

export type Auth = (typeof AUTH_PROVIDERS)[number]["value"];

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]["value"];

export type NginxMode = (typeof NGINX_MODES)[number]["value"];

export type GithubActionsStep =
  | (typeof GITHUB_ACTIONS_CI_STEPS)[number]["value"]
  | (typeof GITHUB_ACTIONS_CD_STEPS)[number]["value"];

/** Production-deployment options, collected only when a mode is chosen. */
export interface ProductionOptions {
  mode: NginxMode;
}

/**
 * The resolved project configuration — the contract between the wizard (which
 * produces it) and the generator (which consumes it). A feature's shape starts
 * here.
 */
export interface ProjectConfig {
  projectName: string;
  targetDir: string;
  action: ConflictAction;
  componentLibrary: ComponentLibrary;
  tailwind: boolean;
  shadcn?: ShadcnOptions;
  database?: DatabaseOptions;
  api?: ApiConfig;
  auth: Auth;
  email: EmailProvider;
  production?: ProductionOptions;
  githubActions: GithubActionsStep[];
  git: boolean;
  packageManager: PackageManager;
  install: boolean;
}
