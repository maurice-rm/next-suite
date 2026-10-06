import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import { execa } from "execa";
import fs from "fs-extra";

import type { ProjectManifest } from "@/generator/manifest";
import { navigableText, renderProvisionOutro } from "@/ui";

import { CancelledError } from "./cancelled-error";
import { exitWithCommandError, renderCommandIntro } from "./command-frame";
import {
  configPath,
  type GlobalConfig,
  parseGlobalConfig,
  serializeGlobalConfig,
} from "./config";
import { promptConfig, requiredInput } from "./config-command";
import { resolveDeployTarget } from "./deploy-target";
import { isValidHostname } from "./dns";
import { PRIVATE_FILE_MODE } from "./file-modes";
import { resolveGhRepo } from "./github-cli";
import { parseManifest, requireProxied } from "./manifest";
import { buildDryRunPlan } from "./plan";
import { allocatePort } from "./port";
import { runPreflight } from "./preflight";
import {
  promptProvisionAnswers,
  type ProvisionAnswers,
} from "./provision-wizard";
import { runProvision } from "./run-provision";
import {
  createStepSpinner,
  runWithSpinner,
  type StepSpinner,
} from "./spinner-steps";
import type { SshTarget } from "./ssh";

const MANIFEST_FILE = "next-suite.json";

const ENV_EXAMPLE_FILE = ".env.example";

interface ProvisionArgs {
  domain?: string;
  isNonInteractive: boolean;
  isDryRun: boolean;
  isStaging?: boolean;
  shouldSkipGithub?: boolean;
}

interface ProjectFiles {
  manifest: ProjectManifest;
  envExample: string;
}

const readProjectFiles = async (): Promise<ProjectFiles> => {
  if (!(await fs.pathExists(MANIFEST_FILE))) {
    throw new Error(
      "No next-suite.json here. Run provision from a next-suite project directory.",
    );
  }
  const manifest = parseManifest(await fs.readFile(MANIFEST_FILE, "utf8"));
  requireProxied(manifest);

  if (!(await fs.pathExists(ENV_EXAMPLE_FILE))) {
    throw new Error(
      "No .env.example here — it ships with the scaffold; restore it (it is the template for the server .env).",
    );
  }
  return { manifest, envExample: await fs.readFile(ENV_EXAMPLE_FILE, "utf8") };
};

const readSavedConfig = async (): Promise<GlobalConfig | undefined> => {
  const file = configPath();
  if (!(await fs.pathExists(file))) return undefined;
  return parseGlobalConfig(await fs.readFile(file, "utf8"));
};

const loadOrPromptConfig = async (): Promise<GlobalConfig> => {
  const saved = await readSavedConfig();
  if (saved) return saved;
  const config = await promptConfig();
  await fs.outputFile(configPath(), serializeGlobalConfig(config), {
    mode: PRIVATE_FILE_MODE,
  });
  return config;
};

const assertValidDomain = (domain: string): void => {
  if (!isValidHostname(domain)) throw new Error(`Invalid domain: ${domain}`);
};

/** Used by --dry-run and --yes, which never back-navigate — a cancelled prompt still throws {@link CancelledError}. */
const resolveDomain = async (flag?: string): Promise<string> => {
  if (flag) {
    assertValidDomain(flag);
    return flag;
  }
  const input = await navigableText({
    message: "Public domain for this project",
    validate: requiredInput("Domain"),
  });
  if (typeof input !== "string") throw new CancelledError();
  assertValidDomain(input);
  return input;
};

/** --dry-run promises to change nothing — including the config file, so a prompted config is not saved. */
const printDryRunPlan = async (
  args: ProvisionArgs,
  project: ProjectFiles,
): Promise<void> => {
  const config = (await readSavedConfig()) ?? (await promptConfig());
  const domain = await resolveDomain(args.domain);
  const lines = buildDryRunPlan({
    ...project,
    config,
    domain,
    port: allocatePort([], []),
  });
  p.log.step("Provision plan (dry run — no server changes in this version):");
  for (const line of lines) p.log.message(line);
};

const resolveProvisionAnswers = async (
  args: ProvisionArgs,
  project: ProjectFiles,
  config: GlobalConfig,
): Promise<ProvisionAnswers> => {
  if (args.isNonInteractive) {
    return {
      domain: await resolveDomain(args.domain),
      isStaging: Boolean(args.isStaging),
      shouldSkipGithub: Boolean(args.shouldSkipGithub),
    };
  }
  if (args.domain !== undefined) assertValidDomain(args.domain);
  return promptProvisionAnswers(
    {
      domain: args.domain,
      isStaging: args.isStaging,
      shouldSkipGithub: args.shouldSkipGithub,
    },
    {
      config,
      manifest: project.manifest,
      deploy: resolveDeployTarget(project.manifest.name, config.host),
    },
  );
};

const isCommandSuccessful = async (
  file: string,
  args: string[],
): Promise<boolean> =>
  (await execa(file, args, { reject: false })).exitCode === 0;

const resolveGithubTarget = async (knownRepo?: string): Promise<string> => {
  if (!(await isCommandSuccessful("git", ["remote", "get-url", "origin"]))) {
    throw new Error("No GitHub remote — add one or pass --skip-github.");
  }
  if (!(await isCommandSuccessful("gh", ["auth", "status"]))) {
    throw new Error(
      "gh is not authenticated — run `gh auth login` or pass --skip-github.",
    );
  }
  const repo = knownRepo ?? (await resolveGhRepo());
  if (repo === undefined) {
    throw new Error(
      "Could not resolve the GitHub repository (gh repo view) — the secrets must not go to an unknown target; fix the remote or pass --skip-github.",
    );
  }
  return repo;
};

const runPreflightStep = async (
  spinner: StepSpinner,
  target: SshTarget,
): Promise<void> => {
  spinner.onStepStart("Preflight…");
  await runWithSpinner(spinner, () => runPreflight(target));
  spinner.onStep("Preflight passed");
};

const renderProvisionResult = (options: {
  name: string;
  domain: string;
  deployPath: string;
  isCertReady: boolean;
}): void => {
  const certificateLines = options.isCertReady
    ? [`App:    https://${options.domain}`]
    : [
        "TLS deferred — re-run once DNS points here.",
        "Let's Encrypt: 5 failed validations per hostname per hour, one",
        "slot back every 12 min. --staging has its own, far higher limits.",
      ];
  renderProvisionOutro(`${options.name} provisioned.`, [
    ...certificateLines,
    `Deploy: ${options.deployPath}`,
    "See DEPLOY.md for the deploy workflow.",
  ]);
};

const runProvisionCommand = async (args: ProvisionArgs): Promise<void> => {
  if (args.isNonInteractive && !args.domain) {
    throw new Error("--yes requires --domain.");
  }
  if (!args.isNonInteractive && !args.isDryRun) {
    await renderCommandIntro("Provision a server");
  }

  const project = await readProjectFiles();
  if (args.isDryRun) {
    await printDryRunPlan(args, project);
    return;
  }

  const config = await loadOrPromptConfig();
  const answers = await resolveProvisionAnswers(args, project, config);
  const spinner = createStepSpinner();
  await runPreflightStep(spinner, {
    host: config.host,
    user: config.adminUser,
  });
  const repo = answers.shouldSkipGithub
    ? undefined
    : await resolveGithubTarget(answers.repo);

  const { isCertReady } = await runWithSpinner(spinner, () =>
    runProvision(
      { ...project, ...answers, config, repo },
      {
        onStepStart: spinner.onStepStart,
        onStep: spinner.onStep,
        onBlock: (title, body) => {
          p.note(body, title);
        },
      },
    ),
  );

  renderProvisionResult({
    name: project.manifest.name,
    domain: answers.domain,
    deployPath: resolveDeployTarget(project.manifest.name, config.host).path,
    isCertReady,
  });
};

export const provisionCommand = defineCommand({
  meta: {
    name: "provision",
    description: "Provision a server for a scaffolded project (over SSH)",
  },
  args: {
    domain: { type: "string", description: "Public domain for the project" },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Non-interactive: requires --domain, no prompts",
    },
    "dry-run": {
      type: "boolean",
      description: "Print the plan without changing anything",
    },
    staging: {
      type: "boolean",
      description: "Request a Let's Encrypt staging certificate",
    },
    "skip-github": {
      type: "boolean",
      description: "Skip configuring GitHub Actions secrets and variables",
    },
  },
  run: async ({ args }) => {
    try {
      await runProvisionCommand({
        domain: args.domain,
        isNonInteractive: Boolean(args.yes),
        isDryRun: Boolean(args["dry-run"]),
        isStaging: args.staging,
        shouldSkipGithub: args["skip-github"],
      });
    } catch (error) {
      exitWithCommandError(error);
    }
  },
});
