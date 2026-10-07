import type { ApiConfig, ProjectConfig, ShadcnOptions } from "@/core/types";

/**
 * Representative project configurations shared by the golden snapshot test and
 * the generated-build CI harness, so both exercise the same matrix. Not a test
 * file itself (no `.test` suffix), so importing it never runs tests.
 */
export const baseConfig: ProjectConfig = {
  projectName: "acme-app",
  targetDir: "/tmp/acme-app",
  action: "create",
  tailwind: false,
  api: undefined,
  auth: "none",
  email: "none",
  git: false,
  packageManager: "npm",
  install: false,
  githubActions: [],
};

// Representative matrix: every package manager, shadcn on/off, tailwind on/off,
// all four database engine × ORM combos, every api type, every auth provider,
// email/git/install on/off, and all three conflict actions spread across the entries.
export const SCENARIOS: { name: string; config: ProjectConfig }[] = [
  {
    name: "npm · minimal (everything off)",
    config: { ...baseConfig, production: { mode: "proxied" } },
  },
  {
    name: "pnpm · shadcn + full stack",
    config: {
      ...baseConfig,
      projectName: "pnpm-suite",
      packageManager: "pnpm",
      action: "overwrite",
      tailwind: true,
      shadcn: { base: "radix", pointer: true, preset: "b0" },
      database: { engine: "postgres", orm: "drizzle" },
      api: { type: "trpc" },
      auth: "better-auth",
      email: "resend",
      production: { mode: "standalone" },
      githubActions: [
        "lint",
        "typecheck",
        "test",
        "format",
        "build",
        "image",
        "deploy",
      ],
      git: true,
      install: true,
    },
  },
  {
    name: "bun · tailwind, no shadcn",
    config: {
      ...baseConfig,
      projectName: "bun-app",
      packageManager: "bun",
      action: "empty",
      tailwind: true,
      database: { engine: "mysql", orm: "prisma" },
      api: { type: "orpc" },
      auth: "better-auth",
      production: { mode: "standalone" },
      githubActions: ["lint", "build", "image"],
      git: true,
    },
  },
  {
    name: "yarn · shadcn base, no preset",
    config: {
      ...baseConfig,
      projectName: "yarn-thing",
      packageManager: "yarn",
      tailwind: true,
      shadcn: { base: "base", pointer: false },
      database: { engine: "postgres", orm: "prisma" },
      auth: "better-auth",
      email: "resend",
      production: { mode: "proxied" },
      githubActions: ["typecheck", "format"],
      install: true,
    },
  },
  {
    name: "npm · drizzle + mysql",
    config: {
      ...baseConfig,
      projectName: "npm-db",
      database: { engine: "mysql", orm: "drizzle" },
      api: { type: "orpc" },
      githubActions: ["lint"],
    },
  },
  {
    name: "npm · drizzle + mysql + auth",
    config: {
      ...baseConfig,
      projectName: "npm-auth",
      database: { engine: "mysql", orm: "drizzle" },
      auth: "better-auth",
    },
  },
  {
    name: "pnpm · prisma + mysql in production",
    config: {
      ...baseConfig,
      projectName: "pnpm-prisma",
      packageManager: "pnpm",
      database: { engine: "mysql", orm: "prisma" },
      api: { type: "orpc" },
      auth: "better-auth",
      production: { mode: "proxied" },
      githubActions: ["lint", "typecheck"],
    },
  },
  {
    name: "pnpm · tRPC without auth",
    config: {
      ...baseConfig,
      projectName: "trpc-open",
      packageManager: "pnpm",
      tailwind: true,
      api: { type: "trpc" },
      githubActions: ["lint", "typecheck"],
    },
  },
  {
    name: "orpc · openapi + scalar",
    config: {
      ...baseConfig,
      projectName: "orpc-scalar",
      api: { type: "orpc", openapi: { scalar: true } },
    },
  },
  {
    name: "orpc · openapi without scalar",
    config: {
      ...baseConfig,
      projectName: "orpc-openapi",
      api: { type: "orpc", openapi: { scalar: false } },
    },
  },
];

const shadcnFlags = (shadcn: ShadcnOptions): string[] => [
  "--shadcn",
  "--shadcn-base",
  shadcn.base,
  ...(shadcn.preset ? ["--shadcn-preset", shadcn.preset] : []),
  ...(shadcn.pointer ? ["--shadcn-pointer"] : []),
];

const styleFlags = (config: ProjectConfig): string[] => {
  if (config.shadcn) return shadcnFlags(config.shadcn);
  return config.tailwind ? ["--tailwind"] : [];
};

const apiFlags = (api: ApiConfig | undefined): string[] => {
  if (!api) return [];
  const flags = ["--api", api.type];
  if (api.type === "orpc" && api.openapi) {
    flags.push("--openapi");
    if (api.openapi.scalar) flags.push("--scalar");
  }
  return flags;
};

/**
 * Convert a scenario into `create-next-suite --yes` flags for the
 * generated-build CI matrix: the output-affecting dimensions plus `--no-git`.
 * Install stays on (the default) so the post-steps — install, shadcn init, the
 * fix step — actually run.
 */
export const scenarioToFlags = (config: ProjectConfig): string[] => [
  "--pm",
  config.packageManager,
  "--no-git",
  ...styleFlags(config),
  ...(config.database
    ? ["--database", config.database.engine, "--orm", config.database.orm]
    : []),
  ...apiFlags(config.api),
  ...(config.auth === "none" ? [] : ["--auth", config.auth]),
  ...(config.email === "none" ? [] : ["--email", config.email]),
  ...(config.production ? ["--deployment", config.production.mode] : []),
  ...(config.githubActions.length > 0
    ? ["--github-actions", config.githubActions.join(",")]
    : []),
];
