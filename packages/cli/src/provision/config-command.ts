import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import fs from "fs-extra";

import { classifyVersion } from "@/core/version-check";
import { fetchLatestVersion } from "@/latest-version";
import { navigableText, renderProvisionOutro, renderTitle } from "@/ui";
import { isGoBack, required, runWizard, type WizardStep } from "@/wizard";

import pkg from "../../package.json";
import {
  configPath,
  EMAIL_PATTERN,
  type GlobalConfig,
  parseGlobalConfig,
  serializeGlobalConfig,
} from "./config";

export const requiredInput =
  (label: string) =>
  (value: string | undefined): string | undefined =>
    (value ?? "").trim().length === 0 ? `${label} is required.` : undefined;

const validEmail = (value: string | undefined): string | undefined => {
  const missing = requiredInput("Email")(value);
  if (missing) return missing;
  return EMAIL_PATTERN.test(value ?? "")
    ? undefined
    : "Enter a valid email address.";
};

/** One text-field step: back-navigable, and a cancel throws "Cancelled." (instead of
 * runWizard's own exit) so callers keep their existing "Nothing changed." message. */
const configField = (
  key: keyof GlobalConfig,
  message: string,
  validate: (value: string | undefined) => string | undefined,
  fallback?: string,
): WizardStep<GlobalConfig> => ({
  key,
  run: async (a, canGoBack) => {
    const answer = await navigableText({
      message,
      initialValue: a[key] ?? fallback,
      validate,
      canGoBack,
    });
    if (isGoBack(answer)) return answer;
    if (p.isCancel(answer)) throw new Error("Cancelled.");
    return answer;
  },
});

export const promptConfig = async (
  initial?: GlobalConfig,
): Promise<GlobalConfig> => {
  const steps: WizardStep<GlobalConfig>[] = [
    configField(
      "host",
      "Server host (SSH)",
      requiredInput("Host"),
      initial?.host,
    ),
    configField(
      "adminUser",
      "Admin SSH user",
      requiredInput("Admin user"),
      initial?.adminUser ?? "root",
    ),
    configField(
      "certbotEmail",
      "Let's Encrypt email",
      validEmail,
      initial?.certbotEmail,
    ),
  ];
  const answers = await runWizard<GlobalConfig>(steps);
  return {
    host: required(answers.host, "host"),
    adminUser: required(answers.adminUser, "adminUser"),
    certbotEmail: required(answers.certbotEmail, "certbotEmail"),
  };
};

export const configCommand = defineCommand({
  meta: {
    name: "config",
    description: "Show and edit the global next-suite config",
  },
  run: async () => {
    try {
      const file = configPath();
      const existing = (await fs.pathExists(file))
        ? parseGlobalConfig(await fs.readFile(file, "utf8"))
        : undefined;

      const latest = await fetchLatestVersion(pkg.name);
      renderTitle(pkg.version, classifyVersion(pkg.version, latest));
      p.intro("next-suite config");
      const config = await promptConfig(existing);
      await fs.outputFile(file, serializeGlobalConfig(config));
      renderProvisionOutro("Config saved.", [
        `Config: ${file}`,
        `Host:   ${config.adminUser}@${config.host}`,
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
