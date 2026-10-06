import * as p from "@clack/prompts";
import { defineCommand } from "citty";

import { navigableConfirm, renderProvisionOutro } from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import { CancelledError } from "./cancelled-error";
import { exitWithCommandError, renderCommandIntro } from "./command-frame";
import { configPath, type GlobalConfig, parseGlobalConfig } from "./config";
import { getDeployPath } from "./deploy-target";
import { type DeprovisionState, discoverState } from "./deprovision-state";
import { resolveGhRepo } from "./github-cli";
import { readFileIfExists } from "./local-file";
import { parseManifest } from "./manifest";
import { runDeprovision } from "./run-deprovision";
import { getNginxConfPath } from "./server-paths";
import { createStepSpinner, runWithSpinner } from "./spinner-steps";

interface DeprovisionArgs {
  domain?: string;
  isNonInteractive: boolean;
  shouldSkipGithub: boolean;
}

interface DeprovisionChoices {
  shouldRemoveServer: boolean;
  shouldRemoveGithub: boolean;
  shouldRemoveLocalKeys: boolean;
}

const readRequiredFile = async (
  file: string,
  missingMessage: string,
): Promise<string> => {
  const content = await readFileIfExists(file);
  if (content === undefined) throw new Error(missingMessage);
  return content;
};

/** One confirm gate: back-navigable, and a cancel throws {@link CancelledError} (instead of
 * runWizard's own exit) so the caller keeps its "Nothing changed." message. */
const createGate = (options: {
  key: keyof DeprovisionChoices;
  message: string;
  isConfirmedByDefault: boolean;
}): WizardStep<DeprovisionChoices> => ({
  key: options.key,
  run: async (answers, canGoBack) => {
    const answer = await navigableConfirm({
      message: options.message,
      initialValue: answers[options.key] ?? options.isConfirmedByDefault,
      canGoBack,
    });
    if (isGoBack(answer)) return answer;
    if (p.isCancel(answer)) throw new CancelledError();
    return answer;
  },
});

const SERVER_GATE = createGate({
  key: "shouldRemoveServer",
  message:
    "Remove server-side config (nginx, cert, user, /srv/www, port entry)?",
  isConfirmedByDefault: false,
});

const GITHUB_GATE = createGate({
  key: "shouldRemoveGithub",
  message: "Delete GitHub Actions deploy secrets and variables?",
  isConfirmedByDefault: true,
});

const LOCAL_KEYS_GATE = createGate({
  key: "shouldRemoveLocalKeys",
  message: "Delete the local deploy key?",
  isConfirmedByDefault: true,
});

/**
 * Walk the teardown gates with back-navigation (server has no back — it's
 * first). --skip-github drops the github gate entirely rather than giving it
 * a silent step, so back-navigation from local-keys reaches server directly.
 */
const promptDeprovisionChoices = async (
  args: DeprovisionArgs,
): Promise<DeprovisionChoices> => {
  const steps = args.shouldSkipGithub
    ? [SERVER_GATE, LOCAL_KEYS_GATE]
    : [SERVER_GATE, GITHUB_GATE, LOCAL_KEYS_GATE];
  const answers = await runWizard<DeprovisionChoices>(steps);
  return {
    shouldRemoveServer: required(answers.shouldRemoveServer, "server"),
    shouldRemoveGithub: args.shouldSkipGithub
      ? false
      : required(answers.shouldRemoveGithub, "github"),
    shouldRemoveLocalKeys: required(answers.shouldRemoveLocalKeys, "localKeys"),
  };
};

const resolveChoices = async (
  args: DeprovisionArgs,
): Promise<DeprovisionChoices> => {
  const choices = args.isNonInteractive
    ? {
        shouldRemoveServer: true,
        shouldRemoveGithub: !args.shouldSkipGithub,
        shouldRemoveLocalKeys: true,
      }
    : await promptDeprovisionChoices(args);
  if (
    !choices.shouldRemoveServer &&
    !choices.shouldRemoveGithub &&
    !choices.shouldRemoveLocalKeys
  ) {
    throw new CancelledError();
  }
  return choices;
};

const listFoundResources = (
  name: string,
  state: DeprovisionState,
  domain: string | undefined,
): string[] =>
  [
    state.hasNginxConf && `nginx conf: ${getNginxConfPath(name)}`,
    domain && `domain: ${domain}`,
    state.hasCertificate && "TLS certificate present",
    state.hasUser && `user: ${name}`,
    state.hasAppDirectory && getDeployPath(name),
    state.hasPortEntry && "port registry entry",
    state.hasLocalKeys && "local deploy key",
  ].filter((line): line is string => Boolean(line));

const renderFoundResources = (options: {
  name: string;
  config: GlobalConfig;
  repo: string | undefined;
  found: string[];
}): void => {
  const { name, config, repo, found } = options;
  p.note(
    [
      `Server:  ${config.adminUser}@${config.host}`,
      ...(repo ? [`GitHub:  ${repo}`] : []),
      ...found,
    ].join("\n"),
    `Found for ${name}`,
  );
};

const renderDeprovisionOutro = (options: {
  name: string;
  config: GlobalConfig;
  domain: string | undefined;
  leftovers: string[];
}): void => {
  const { name, config, domain, leftovers } = options;
  const headline =
    leftovers.length > 0
      ? `${name} partly deprovisioned — ${leftovers.join(", ")} still there.`
      : `${name} deprovisioned.`;
  renderProvisionOutro(headline, [
    `Server: ${config.adminUser}@${config.host}`,
    ...(domain ? [`Domain: ${domain}`] : []),
  ]);
};

const runDeprovisionCommand = async (args: DeprovisionArgs): Promise<void> => {
  const manifest = parseManifest(
    await readRequiredFile(
      "next-suite.json",
      "No next-suite.json here. Run deprovision from a next-suite project directory.",
    ),
  );
  const config = parseGlobalConfig(
    await readRequiredFile(
      configPath(),
      "No global config found. Run `next-suite config` first.",
    ),
  );
  const { name } = manifest;

  if (!args.isNonInteractive) await renderCommandIntro("Deprovision a server");

  const target = { host: config.host, user: config.adminUser };
  const spinner = createStepSpinner();
  spinner.onStepStart("Inspecting server…");
  const state = await runWithSpinner(spinner, () =>
    discoverState(name, target),
  );
  spinner.onStep("Server inspected");
  const domain = state.domain ?? args.domain;

  const found = listFoundResources(name, state, domain);
  if (found.length === 0) {
    renderProvisionOutro("Nothing to deprovision.", [
      `Project: ${name}`,
      "Pass --domain to target a leftover certificate.",
    ]);
    return;
  }

  const repo = args.shouldSkipGithub ? undefined : await resolveGhRepo();
  renderFoundResources({ name, config, repo, found });
  const choices = await resolveChoices(args);

  const { leftovers } = await runWithSpinner(spinner, () =>
    runDeprovision(
      { name, target, domain: args.domain, repo, ...choices },
      { onStepStart: spinner.onStepStart, onStep: spinner.onStep },
    ),
  );
  renderDeprovisionOutro({ name, config, domain, leftovers });
};

export const deprovisionCommand = defineCommand({
  meta: {
    name: "deprovision",
    description: "Tear down a previously provisioned server target (over SSH)",
  },
  args: {
    domain: {
      type: "string",
      description:
        "Domain to target (fallback when none is found on the server)",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Non-interactive: remove everything found, no prompts",
    },
    "skip-github": {
      type: "boolean",
      description: "Skip deleting GitHub Actions secrets and variables",
    },
  },
  run: async ({ args }) => {
    try {
      await runDeprovisionCommand({
        domain: args.domain,
        isNonInteractive: Boolean(args.yes),
        shouldSkipGithub: Boolean(args["skip-github"]),
      });
    } catch (error) {
      exitWithCommandError(error);
    }
  },
});
