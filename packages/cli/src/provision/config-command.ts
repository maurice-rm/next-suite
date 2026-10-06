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
  validateShellSafe,
} from "./config";
import { PRIVATE_FILE_MODE } from "./file-modes";

type Validate = (value: string | undefined) => string | undefined;

export const requiredInput =
  (label: string): Validate =>
  (value) =>
    (value ?? "").trim().length === 0 ? `${label} is required.` : undefined;

const shellSafeInput =
  (label: string): Validate =>
  (value) =>
    requiredInput(label)(value) ??
    validateShellSafe(label, (value ?? "").trim());

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
      validate: shellSafeInput("Host"),
      initialValue: initial?.host,
    }),
    createConfigField({
      key: "adminUser",
      message: "Admin SSH user",
      validate: shellSafeInput("Admin user"),
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
    host: required(answers.host, "host").trim(),
    adminUser: required(answers.adminUser, "adminUser").trim(),
    certbotEmail: required(answers.certbotEmail, "certbotEmail").trim(),
  };
};

export const saveGlobalConfig = async (config: GlobalConfig): Promise<void> => {
  await fs.outputFile(configPath(), serializeGlobalConfig(config), {
    mode: PRIVATE_FILE_MODE,
  });
};

/** A saved config that no longer parses is offered for repair instead of blocking the command that fixes it. */
const readEditableConfig = async (
  file: string,
): Promise<GlobalConfig | undefined> => {
  if (!(await fs.pathExists(file))) return undefined;
  try {
    return parseGlobalConfig(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    p.log.warn(`${error.message} — enter the values again to replace it.`);
    return undefined;
  }
};

const runConfigCommand = async (): Promise<void> => {
  const file = configPath();
  const existing = await readEditableConfig(file);

  await renderCommandIntro("next-suite config");
  const config = await promptConfig(existing);
  await saveGlobalConfig(config);
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
