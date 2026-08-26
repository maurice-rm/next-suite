import type { ProjectConfig } from "@/core/types";
import { isCdStep } from "@/options";

import type { DependencyName } from "./dependencies";

/**
 * Dependency names, either static or derived from the config — for a feature
 * whose packages vary within itself (e.g. an ORM's engine-specific driver).
 */
export type FeatureDependencies =
  DependencyName[] | ((config: ProjectConfig) => DependencyName[]);

/**
 * Everything that defines a generation feature, in one place. Add a feature as
 * one self-contained {@link FEATURES} entry — the dependency names below are
 * illustrative; real ones must be declared in `VERSIONS`.
 *
 * @example
 * {
 *   dir: "features/widget",
 *   when: (config) => config.widget !== undefined,
 *   dependencies: ["some-runtime-dep"],
 *   devDependencies: ["some-dev-dep"],
 * }
 */
export interface Feature {
  /** Template directory to render, relative to the templates root. */
  dir: string;
  /** Whether this feature applies to the config; omit for an always-on feature. */
  when?: (config: ProjectConfig) => boolean;
  /** Runtime dependencies this feature contributes (catalog names). */
  dependencies?: FeatureDependencies;
  /** Dev dependencies this feature contributes (catalog names). */
  devDependencies?: FeatureDependencies;
}

export const FEATURES: Feature[] = [
  {
    dir: "base",
    dependencies: ["next", "react", "react-dom", "zod", "@t3-oss/env-nextjs"],
    devDependencies: [
      "@types/node",
      "@types/react",
      "@types/react-dom",
      "typescript",
      "eslint",
      "eslint-config-next",
      "eslint-config-prettier",
      "eslint-plugin-simple-import-sort",
      "eslint-plugin-import",
      "prettier",
      "prettier-plugin-packagejson",
      "husky",
      "lint-staged",
      "@commitlint/cli",
      "@commitlint/config-conventional",
      "babel-plugin-react-compiler",
    ],
  },
  {
    dir: "features/yarn",
    when: (config) => config.packageManager === "yarn",
  },
  {
    dir: "features/tailwind",
    when: (config) => config.tailwind,
    devDependencies: [
      "tailwindcss",
      "@tailwindcss/postcss",
      "postcss",
      "prettier-plugin-tailwindcss",
    ],
  },
  {
    dir: "features/database/engine/postgres",
    when: (config) => config.database?.engine === "postgres",
  },
  {
    dir: "features/database/engine/mysql",
    when: (config) => config.database?.engine === "mysql",
  },
  {
    dir: "features/database/orm/drizzle",
    when: (config) => config.database?.orm === "drizzle",
    dependencies: (config) => [
      "drizzle-orm",
      "dotenv",
      config.database?.engine === "postgres" ? "pg" : "mysql2",
    ],
    devDependencies: (config) =>
      config.database?.engine === "postgres"
        ? ["drizzle-kit", "@types/pg"]
        : ["drizzle-kit"],
  },
  {
    dir: "features/database/orm/prisma",
    when: (config) => config.database?.orm === "prisma",
    dependencies: (config) => [
      "@prisma/client",
      "dotenv",
      config.database?.engine === "postgres"
        ? "@prisma/adapter-pg"
        : "@prisma/adapter-mariadb",
    ],
    devDependencies: ["prisma"],
  },
  {
    dir: "features/api/trpc",
    when: (config) => config.api?.type === "trpc",
    dependencies: [
      "@trpc/server",
      "@trpc/client",
      "@trpc/tanstack-react-query",
      "@tanstack/react-query",
      "superjson",
      "server-only",
      "zod",
    ],
  },
  {
    dir: "features/api/orpc/core",
    when: (config) => config.api?.type === "orpc",
    dependencies: [
      "@orpc/server",
      "@orpc/client",
      "@orpc/tanstack-query",
      "@tanstack/react-query",
      "server-only",
    ],
  },
  {
    dir: "features/api/orpc/openapi",
    when: (config) =>
      config.api?.type === "orpc" && config.api.openapi !== undefined,
    dependencies: ["@orpc/openapi", "@orpc/zod"],
  },
  {
    dir: "features/auth/better-auth/core",
    when: (config) =>
      config.auth === "better-auth" && config.database !== undefined,
    dependencies: ["better-auth"],
  },
  {
    dir: "features/auth/better-auth/schema/drizzle",
    when: (config) =>
      config.auth === "better-auth" && config.database?.orm === "drizzle",
  },
  {
    dir: "features/auth/better-auth/schema/prisma",
    when: (config) =>
      config.auth === "better-auth" && config.database?.orm === "prisma",
  },
  {
    dir: "features/email/resend",
    when: (config) => config.email === "resend",
    dependencies: ["resend"],
  },
  {
    dir: "features/production/core",
    when: (config) => config.production !== undefined,
  },
  {
    dir: "features/production/entrypoint",
    when: (config) =>
      config.production !== undefined && config.database !== undefined,
  },
  {
    dir: "features/production/drizzle",
    when: (config) =>
      config.production !== undefined && config.database?.orm === "drizzle",
    devDependencies: ["esbuild"],
  },
  {
    dir: "features/github-actions/ci",
    when: (config) =>
      (config.githubActions ?? []).some((step) => !isCdStep(step)),
  },
  {
    dir: "features/github-actions/cd",
    when: (config) =>
      config.production !== undefined &&
      (config.githubActions ?? []).some(isCdStep),
  },
];
