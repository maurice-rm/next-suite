import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import fs from "fs-extra";

import { navigableText, renderProvisionOutro } from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import { CancelledError } from "./cancelled-error";
import { exitWithCommandError, renderCommandIntro } from "./command-frame";
import {
  configPath,
  EMAIL_PATTERN,
  type GlobalConfig,
  parseGlobalConfig,
  serializeGlobalConfig,
} from "./config";

type Validate = (value: string | undefined) => string | undefined;

export const requiredInput =
  (label: string): Validate =>
  (value) =>
    (value ?? "").trim().length === 0 ? `${label} is required.` : undefined;

const validateEmail: Validate = (value) => {
  const missing = requiredInput("Email")(value);
  if (missing) return missing;
  return EMAIL_PATTERN.test(value ?? "")
    ? undefined
    : "Enter a valid email address.";
};

/** One text-field step: back-navigable, and a cancel throws {@link CancelledError} (instead of
 * runWizard's own exit) so callers keep their existing "Nothing changed." message. */
const createConfigField = (options: {
  key: keyof GlobalConfig;
  message: string;
  validate: Validate;
  initialValue?: string;
}): WizardStep<GlobalConfig> => ({
  key: options.key,
  run: async (answers, canGoBack) => {
    const answer = await navigableText({
      message: options.message,
      initialValue: answers[options.key] ?? options.initialValue,
      validate: options.validate,
      canGoBack,
    });
    if (isGoBack(answer)) return answer;
    if (p.isCancel(answer)) throw new CancelledError();
    return answer;
  },
});

export const promptConfig = async (
  initial?: GlobalConfig,
): Promise<GlobalConfig> => {
  const steps: WizardStep<GlobalConfig>[] = [
    createConfigField({
      key: "host",
      message: "Server host (SSH)",
      validate: requiredInput("Host"),
      initialValue: initial?.host,
    }),
    createConfigField({
      key: "adminUser",
      message: "Admin SSH user",
      validate: requiredInput("Admin user"),
      initialValue: initial?.adminUser ?? "root",
    }),
    createConfigField({
      key: "certbotEmail",
      message: "Let's Encrypt email",
      validate: validateEmail,
      initialValue: initial?.certbotEmail,
    }),
  ];
  const answers = await runWizard<GlobalConfig>(steps);
  return {
    host: required(answers.host, "host"),
    adminUser: required(answers.adminUser, "adminUser"),
    certbotEmail: required(answers.certbotEmail, "certbotEmail"),
  };
};

const runConfigCommand = async (): Promise<void> => {
  const file = configPath();
  const existing = (await fs.pathExists(file))
    ? parseGlobalConfig(await fs.readFile(file, "utf8"))
    : undefined;

  await renderCommandIntro("next-suite config");
  const config = await promptConfig(existing);
  await fs.outputFile(file, serializeGlobalConfig(config));
  renderProvisionOutro("Config saved.", [
    `Config: ${file}`,
    `Host:   ${config.adminUser}@${config.host}`,
  ]);
};

export const configCommand = defineCommand({
  meta: {
    name: "config",
    description: "Show and edit the global next-suite config",
  },
  run: async () => {
    try {
      await runConfigCommand();
    } catch (error) {
      exitWithCommandError(error);
    }
  },
});
