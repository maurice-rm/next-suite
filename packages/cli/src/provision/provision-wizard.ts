import * as p from "@clack/prompts";

import type { ProjectManifest } from "@/generator/manifest";
import { navigableConfirm, navigableText } from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import { CancelledError } from "./cancelled-error";
import type { GlobalConfig } from "./config";
import { requiredInput } from "./config-command";
import type { DeployTarget } from "./deploy-target";
import { isValidHostname } from "./dns";
import { resolveGhRepo } from "./github-cli";

interface ProvisionWizardAnswers {
  domain: string;
  isStaging: boolean;
  shouldConfigureGithub: boolean;
  shouldProceed: boolean;
}

export interface ProvisionFlags {
  domain?: string;
  isStaging?: boolean;
  shouldSkipGithub?: boolean;
}

export interface ProvisionAnswers {
  domain: string;
  isStaging: boolean;
  shouldSkipGithub: boolean;
  repo?: string;
}

export interface ProvisionPlanContext {
  config: GlobalConfig;
  manifest: ProjectManifest;
  deploy: DeployTarget;
}

type ProvisionStep = WizardStep<ProvisionWizardAnswers>;

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
  if (flags.isStaging === undefined) keys.push("isStaging");
  if (flags.shouldSkipGithub === undefined) keys.push("shouldConfigureGithub");
  keys.push("shouldProceed");
  return keys;
};

const resolveAnswers = (
  flags: ProvisionFlags,
  answers: Partial<ProvisionWizardAnswers>,
): Omit<ProvisionAnswers, "repo"> => ({
  domain: flags.domain ?? required(answers.domain, "domain"),
  isStaging: flags.isStaging ?? required(answers.isStaging, "isStaging"),
  shouldSkipGithub:
    flags.shouldSkipGithub ??
    !required(answers.shouldConfigureGithub, "shouldConfigureGithub"),
});

const DOMAIN_STEP: ProvisionStep = {
  key: "domain",
  run: async (answers) => {
    const input = await navigableText({
      message: "Public domain for this project",
      initialValue: answers.domain,
      validate: requiredInput("Domain"),
    });
    if (typeof input !== "string") return input;
    if (!isValidHostname(input)) {
      throw new Error(`Invalid domain: ${input}`);
    }
    return input;
  },
};

const STAGING_STEP: ProvisionStep = {
  key: "isStaging",
  run: (answers, canGoBack) =>
    navigableConfirm({
      message: "Use Let's Encrypt staging certificates (testing)?",
      initialValue: answers.isStaging ?? false,
      canGoBack,
    }),
};

const GITHUB_STEP: ProvisionStep = {
  key: "shouldConfigureGithub",
  run: (answers, canGoBack) =>
    navigableConfirm({
      message: "Set GitHub Actions deploy secrets?",
      initialValue: answers.shouldConfigureGithub ?? true,
      canGoBack,
    }),
};

const formatGithubLine = (answers: ProvisionAnswers): string => {
  if (answers.shouldSkipGithub) return "no";
  return answers.repo ?? "yes (repo unresolved)";
};

const renderProvisionPlan = (
  context: ProvisionPlanContext,
  answers: ProvisionAnswers,
): void => {
  const { config, manifest, deploy } = context;
  p.note(
    [
      `Server:  ${config.adminUser}@${config.host}`,
      `Project: ${manifest.name}`,
      `Domain:  ${answers.domain}`,
      `Deploy:  ${deploy.user}@${deploy.path}`,
      `Cert:    ${answers.isStaging ? "staging" : "production"}`,
      `GitHub:  ${formatGithubLine(answers)}`,
      "",
      "⚠ The deploy user joins the docker group, which on this",
      "  host is equivalent to root.",
      ...(answers.shouldSkipGithub
        ? []
        : ["  Its private key is uploaded as DEPLOY_SSH_KEY."]),
    ].join("\n"),
    "Provision plan",
  );
};

const createProceedStep = (options: {
  flags: ProvisionFlags;
  context: ProvisionPlanContext;
  resolution: { repo?: string };
}): ProvisionStep => ({
  key: "shouldProceed",
  run: async (answers, canGoBack) => {
    const { flags, context, resolution } = options;
    const resolved = resolveAnswers(flags, answers);
    if (!resolved.shouldSkipGithub) resolution.repo ??= await resolveGhRepo();
    renderProvisionPlan(context, { ...resolved, repo: resolution.repo });
    const proceed = await navigableConfirm({
      message: "Provision now?",
      canGoBack,
    });
    if (isGoBack(proceed) || p.isCancel(proceed)) return proceed;
    if (!proceed) throw new CancelledError();
    return true;
  },
});

export const promptProvisionAnswers = async (
  flags: ProvisionFlags,
  context: ProvisionPlanContext,
): Promise<ProvisionAnswers> => {
  const resolution: { repo?: string } = {};
  const stepsByKey: Record<keyof ProvisionWizardAnswers, ProvisionStep> = {
    domain: DOMAIN_STEP,
    isStaging: STAGING_STEP,
    shouldConfigureGithub: GITHUB_STEP,
    shouldProceed: createProceedStep({ flags, context, resolution }),
  };
  const steps = provisionStepKeys(flags).map((key) => ({ ...stepsByKey[key] }));
  const first = steps[0];
  if (first) first.section = "Provision";

  const answers = await runWizard<ProvisionWizardAnswers>(steps);
  return { ...resolveAnswers(flags, answers), repo: resolution.repo };
};
