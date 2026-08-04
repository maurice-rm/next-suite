#!/usr/bin/env node
import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";

import { satisfiesNodeRange } from "@/core/node-version";
import type { ProjectConfig } from "@/core/types";
import { classifyVersion } from "@/core/version-check";
import { scaffold } from "@/generator";
import { fetchLatestVersion } from "@/latest-version";
import { runPostSteps } from "@/post-steps";
import { configFromFlags, gatherProjectConfig } from "@/prompts";
import { renderOutro, renderTitle } from "@/ui";

import pkg from "../package.json";

const main = defineCommand({
  meta: {
    name: "create-next-suite",
    version: pkg.version,
    description: pkg.description,
  },
  args: {
    name: {
      type: "positional",
      required: false,
      description: "Project name or path",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Non-interactive: build from flags + defaults, no prompts",
    },
    pm: {
      type: "string",
      description: "Package manager: npm, pnpm, yarn, bun",
    },
    tailwind: { type: "boolean", description: "Add Tailwind CSS" },
    shadcn: {
      type: "boolean",
      description: "Add shadcn/ui (implies Tailwind)",
    },
    "shadcn-base": {
      type: "string",
      description: "shadcn base library: base or radix",
    },
    "shadcn-preset": { type: "string", description: "shadcn preset code" },
    "shadcn-pointer": {
      type: "boolean",
      description: "Pointer cursor on buttons",
    },
    database: {
      type: "string",
      description: "Database engine: postgres or mysql (with --orm)",
    },
    orm: {
      type: "string",
      description: "ORM: drizzle or prisma (with --database)",
    },
    api: {
      type: "string",
      description: "API layer: trpc or orpc",
    },
    openapi: {
      type: "boolean",
      description: "Generate an OpenAPI/REST layer (oRPC only)",
    },
    scalar: {
      type: "boolean",
      description: "Add a Scalar API-docs UI (requires --openapi)",
    },
    auth: {
      type: "string",
      description: "Auth provider: better-auth (requires --database)",
    },
    email: {
      type: "string",
      description: "Email provider: resend",
    },
    deployment: {
      type: "string",
      description: "Production deployment: standalone or proxied",
    },
    "github-actions": {
      type: "string",
      description:
        "GitHub Actions steps, comma-separated: lint,typecheck,format,build,image,deploy",
    },
    git: {
      type: "boolean",
      description: "Initialize git (default; --no-git to skip)",
    },
    install: {
      type: "boolean",
      description: "Install dependencies (default; --no-install to skip)",
    },
    overwrite: {
      type: "boolean",
      description: "Overwrite a conflicting target",
    },
    empty: { type: "boolean", description: "Empty a conflicting target first" },
  },
  run: async ({ args }) => {
    if (!satisfiesNodeRange(process.versions.node, pkg.engines.node)) {
      p.log.error(
        `create-next-suite needs Node ${pkg.engines.node} — you are on v${process.versions.node}. Please upgrade Node and try again.`,
      );
      process.exit(1);
    }

    if (!args.yes) {
      const latest = await fetchLatestVersion(pkg.name);
      renderTitle(pkg.version, classifyVersion(pkg.version, latest));
      p.intro("Let's lay the foundation");
    }

    let config: ProjectConfig;
    try {
      config = args.yes
        ? await configFromFlags({
            name: args.name,
            pm: args.pm,
            tailwind: args.tailwind,
            shadcn: args.shadcn,
            shadcnBase: args["shadcn-base"],
            shadcnPreset: args["shadcn-preset"],
            shadcnPointer: args["shadcn-pointer"],
            database: args.database,
            orm: args.orm,
            api: args.api,
            openapi: args.openapi,
            scalar: args.scalar,
            auth: args.auth,
            email: args.email,
            deployment: args.deployment,
            githubActions: args["github-actions"],
            git: args.git,
            install: args.install,
            overwrite: args.overwrite,
            empty: args.empty,
          })
        : await gatherProjectConfig(args.name);
    } catch (error) {
      p.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    try {
      await scaffold(config);
      await runPostSteps(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      p.cancel(
        config.action === "empty"
          ? `${message}\n\nThe target directory may already have been emptied — its previous contents could be gone.`
          : message,
      );
      process.exit(1);
    }

    renderOutro(config);
  },
});

void runMain(main);
