import type { ProjectConfig } from "@/core/types";

/**
 * Representative project configurations shared by the golden snapshot test and
 * the generated-build CI harness, so both exercise the same matrix. Not a test
 * file itself (no `.test` suffix), so importing it never runs tests.
 */
export const baseConfig: ProjectConfig = {
  projectName: "acme-app",
  targetDir: "/tmp/acme-app",
  action: "create",
  componentLibrary: "none",
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
      componentLibrary: "shadcn",
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
      componentLibrary: "shadcn",
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

/**
 * Convert a scenario into `create-next-suite --yes` flags for the
 * generated-build CI matrix: the output-affecting dimensions (package manager,
 * Tailwind, shadcn, database/orm, api, auth, email, deployment, github-actions)
 * plus `--no-git`. Install stays on (the default) so the
 * post-steps — install, shadcn init, the fix step — actually run.
 */
export const scenarioToFlags = (config: ProjectConfig): string[] => {
  const flags = ["--pm", config.packageManager, "--no-git"];
  if (config.componentLibrary === "shadcn") {
    if (!config.shadcn) {
      throw new Error(
        'scenarioToFlags: componentLibrary is "shadcn" but config.shadcn is missing.',
      );
    }
    flags.push("--shadcn", "--shadcn-base", config.shadcn.base);
    if (config.shadcn.preset) {
      flags.push("--shadcn-preset", config.shadcn.preset);
    }
    if (config.shadcn.pointer) flags.push("--shadcn-pointer");
  } else if (config.tailwind) {
    flags.push("--tailwind");
  }
  if (config.database) {
    flags.push(
      "--database",
      config.database.engine,
      "--orm",
      config.database.orm,
    );
  }
  if (config.api) flags.push("--api", config.api.type);
  if (config.api?.type === "orpc" && config.api.openapi) {
    flags.push("--openapi");
    if (config.api.openapi.scalar) flags.push("--scalar");
  }
  if (config.auth !== "none") flags.push("--auth", config.auth);
  if (config.email !== "none") flags.push("--email", config.email);
  if (config.production) flags.push("--deployment", config.production.mode);
  if (config.githubActions.length) {
    flags.push("--github-actions", config.githubActions.join(","));
  }
  return flags;
};
