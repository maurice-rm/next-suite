import type {
  ApiConfig,
  Auth,
  DatabaseOptions,
  EmailProvider,
  GithubActionsStep,
  ProductionOptions,
  ProjectConfig,
} from "@/core/types";
import type { PackageManager } from "@/package-managers";

export interface ProjectManifest {
  version: 1;
  name: string;
  packageManager: PackageManager;
  database?: DatabaseOptions;
  api?: ApiConfig;
  auth: Auth;
  email: EmailProvider;
  production?: ProductionOptions;
  githubActions: GithubActionsStep[];
}

export const buildManifest = (config: ProjectConfig): ProjectManifest => ({
  version: 1,
  name: config.projectName,
  packageManager: config.packageManager,
  ...(config.database ? { database: config.database } : {}),
  ...(config.api ? { api: config.api } : {}),
  auth: config.auth,
  email: config.email,
  ...(config.production ? { production: config.production } : {}),
  githubActions: config.githubActions,
});

export const serializeManifest = (m: ProjectManifest): string =>
  `${JSON.stringify(m, null, 2)}\n`;
