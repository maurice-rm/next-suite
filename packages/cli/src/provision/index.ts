import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import { execa } from "execa";
import fs from "fs-extra";

import { classifyVersion } from "@/core/version-check";
import { fetchLatestVersion } from "@/latest-version";
import {
  navigableConfirm,
  navigableText,
  renderProvisionOutro,
  renderTitle,
} from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import pkg from "../../package.json";
import { deployTargets } from "./commands";
import {
  configPath,
  type GlobalConfig,
  parseGlobalConfig,
  serializeGlobalConfig,
} from "./config";
import { promptConfig, requiredInput } from "./config-command";
import { isValidHostname } from "./dns";
import { parseManifest, requireProxied } from "./manifest";
import { buildDryRunPlan } from "./plan";
import { allocatePort } from "./port";
import { runPreflight } from "./preflight";
import { createStepSpinner } from "./spinner-steps";
import { resolveGhRepo, runProvision } from "./steps";

/** `persist: false` for --dry-run, which promises to change nothing — including this file. */
const loadOrPromptConfig = async (persist = true): Promise<GlobalConfig> => {
  const file = configPath();
  if (await fs.pathExists(file)) {
    return parseGlobalConfig(await fs.readFile(file, "utf8"));
  }
  const config = await promptConfig();
  if (persist) {
    await fs.outputFile(file, serializeGlobalConfig(config), { mode: 0o600 });
  }
  return config;
};

/** Used by --dry-run and --yes, which never back-navigate — a cancelled prompt still throws "Cancelled.". */
const resolveDomain = async (flag?: string): Promise<string> => {
  let domain = flag;
  if (!domain) {
    const input = await navigableText({
      message: "Public domain for this project",
      validate: requiredInput("Domain"),
    });
    if (p.isCancel(input)) throw new Error("Cancelled.");
    domain = input;
  }
  if (!isValidHostname(domain)) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return domain;
};

interface ProvisionWizardAnswers {
  domain: string;
  staging: boolean;
  github: boolean;
  proceed: boolean;
}

export interface ProvisionFlags {
  domain?: string;
  staging?: boolean;
  skipGithub?: boolean;
}

/**
 * Which wizard steps to show, given already-resolved flags. A flagged field
 * gets no step at all (not a step that silently resolves) — that's what lets
 * GO_BACK from a later step walk back through the actual prompts instead of
 * bouncing off an invisible one. The gate is always last.
 */
export const provisionStepKeys = (
  flags: ProvisionFlags,
): (keyof ProvisionWizardAnswers)[] => {
  const keys: (keyof ProvisionWizardAnswers)[] = [];
  if (flags.domain === undefined) keys.push("domain");
  if (flags.staging === undefined) keys.push("staging");
  if (flags.skipGithub === undefined) keys.push("github");
  keys.push("proceed");
  return keys;
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
      if (args.yes && !args.domain) {
        throw new Error("--yes requires --domain.");
      }

      if (!args.yes && !args["dry-run"]) {
        const latest = await fetchLatestVersion(pkg.name);
        renderTitle(pkg.version, classifyVersion(pkg.version, latest));
        p.intro("Provision a server");
      }

      const manifestFile = "next-suite.json";
      if (!(await fs.pathExists(manifestFile))) {
        throw new Error(
          "No next-suite.json here. Run provision from a next-suite project directory.",
        );
      }
      const manifest = parseManifest(await fs.readFile(manifestFile, "utf8"));
      requireProxied(manifest);

      const envExampleFile = ".env.example";
      if (!(await fs.pathExists(envExampleFile))) {
        throw new Error(
          "No .env.example here — it ships with the scaffold; restore it (it is the template for the server .env).",
        );
      }
      const envExample = await fs.readFile(envExampleFile, "utf8");

      const config = await loadOrPromptConfig(!args["dry-run"]);

      if (args["dry-run"]) {
        const domain = await resolveDomain(args.domain);
        const port = allocatePort([], []);
        p.log.step(
          "Provision plan (dry run — no server changes in this version):",
        );
        for (const line of buildDryRunPlan({
          manifest,
          config,
          domain,
          port,
          envExample,
        })) {
          p.log.message(line);
        }
        return;
      }

      const deploy = deployTargets(manifest.name, config.host);

      let repo: string | undefined;

      let domain: string;
      let staging: boolean;
      let skipGithub: boolean;

      if (args.yes) {
        domain = await resolveDomain(args.domain);
        staging = Boolean(args.staging);
        skipGithub = Boolean(args["skip-github"]);
      } else {
        if (args.domain !== undefined && !isValidHostname(args.domain)) {
          throw new Error(`Invalid domain: ${args.domain}`);
        }
        const flags: ProvisionFlags = {
          domain: args.domain,
          staging: args.staging,
          skipGithub: args["skip-github"],
        };

        const stepDefs: Record<
          keyof ProvisionWizardAnswers,
          WizardStep<ProvisionWizardAnswers>
        > = {
          domain: {
            key: "domain",
            run: async (a) => {
              const input = await navigableText({
                message: "Public domain for this project",
                initialValue: a.domain,
                validate: requiredInput("Domain"),
              });
              if (typeof input !== "string") return input;
              if (!isValidHostname(input)) {
                throw new Error(`Invalid domain: ${input}`);
              }
              return input;
            },
          },
          staging: {
            key: "staging",
            run: (a, canGoBack) =>
              navigableConfirm({
                message: "Use Let's Encrypt staging certificates (testing)?",
                initialValue: a.staging ?? false,
                canGoBack,
              }),
          },
          github: {
            key: "github",
            run: (a, canGoBack) =>
              navigableConfirm({
                message: "Set GitHub Actions deploy secrets?",
                initialValue: a.github ?? true,
                canGoBack,
              }),
          },
          proceed: {
            key: "proceed",
            run: async (a, canGoBack) => {
              const d = flags.domain ?? required(a.domain, "domain");
              const s = flags.staging ?? required(a.staging, "staging");
              const gh =
                flags.skipGithub !== undefined
                  ? !flags.skipGithub
                  : required(a.github, "github");
              if (gh && repo === undefined) repo = await resolveGhRepo();
              p.note(
                [
                  `Server:  ${config.adminUser}@${config.host}`,
                  `Project: ${manifest.name}`,
                  `Domain:  ${d}`,
                  `Deploy:  ${deploy.user}@${deploy.path}`,
                  `Cert:    ${s ? "staging" : "production"}`,
                  `GitHub:  ${gh ? (repo ?? "yes (repo unresolved)") : "no"}`,
                  "",
                  "⚠ The deploy user joins the docker group, which on this",
                  "  host is equivalent to root.",
                  ...(gh
                    ? ["  Its private key is uploaded as DEPLOY_SSH_KEY."]
                    : []),
                ].join("\n"),
                "Provision plan",
              );
              const proceed = await navigableConfirm({
                message: "Provision now?",
                canGoBack,
              });
              if (isGoBack(proceed) || p.isCancel(proceed)) return proceed;
              if (!proceed) {
                p.cancel("Nothing changed.");
                process.exit(0);
              }
              return true;
            },
          },
        };

        const steps = provisionStepKeys(flags).map((key) => stepDefs[key]);
        const first = steps[0];
        if (first) first.section = "Provision";

        const answers = await runWizard<ProvisionWizardAnswers>(steps);
        domain = flags.domain ?? required(answers.domain, "domain");
        staging = flags.staging ?? required(answers.staging, "staging");
        skipGithub = flags.skipGithub ?? !required(answers.github, "github");
      }

      const t = { host: config.host, user: config.adminUser };
      const spinner = createStepSpinner();
      spinner.onStepStart("Preflight…");
      try {
        await runPreflight(t);
      } catch (error) {
        spinner.fail();
        throw error;
      }
      spinner.onStep("Preflight passed");

      if (!skipGithub) {
        const remote = await execa("git", ["remote", "get-url", "origin"], {
          reject: false,
        });
        if (remote.exitCode !== 0) {
          throw new Error("no GitHub remote — add one or pass --skip-github");
        }
        const auth = await execa("gh", ["auth", "status"], { reject: false });
        if (auth.exitCode !== 0) {
          throw new Error(
            "gh is not authenticated — run `gh auth login` or pass --skip-github",
          );
        }
        repo ??= await resolveGhRepo();
        if (repo === undefined) {
          throw new Error(
            "could not resolve the GitHub repository (gh repo view) — the secrets must not go to an unknown target; fix the remote or pass --skip-github",
          );
        }
      }

      let certReady: boolean;
      try {
        ({ certReady } = await runProvision(
          manifest,
          config,
          domain,
          envExample,
          { staging, skipGithub, repo },
          {
            onStepStart: spinner.onStepStart,
            onStep: spinner.onStep,
            onBlock: (title, body) => p.note(body, title),
          },
        ));
      } catch (error) {
        spinner.fail();
        throw error;
      }

      renderProvisionOutro(`${manifest.name} provisioned.`, [
        ...(certReady
          ? [`App:    https://${domain}`]
          : [
              "TLS deferred — re-run once DNS points here.",
              "Let's Encrypt: 5 failed validations per hostname per hour, one",
              "slot back every 12 min. --staging has its own, far higher limits.",
            ]),
        `Deploy: ${deploy.path}`,
        "See DEPLOY.md for the deploy workflow.",
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "Cancelled.") {
        p.cancel("Nothing changed.");
        process.exit(0);
      }
      p.cancel(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
