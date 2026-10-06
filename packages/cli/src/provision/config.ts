import os from "node:os";
import path from "node:path";

import { isJsonObject, type JsonObject } from "./json-object";

export interface GlobalConfig {
  host: string;
  adminUser: string;
  certbotEmail: string;
}

export const configPath = (): string =>
  path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "next-suite",
    "config.json",
  );

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SHELL_SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const readRequiredField = (
  data: JsonObject,
  field: keyof GlobalConfig,
): string => {
  const value = data[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Global config is missing '${field}'.`);
  }
  return value;
};

const assertShellSafe = (field: keyof GlobalConfig, value: string): void => {
  if (!SHELL_SAFE.test(value)) {
    throw new Error(
      `Global config '${field}' may only contain letters, digits, dot, dash and underscore, and may not start with a dash: ${value}`,
    );
  }
};

export const parseGlobalConfig = (raw: string): GlobalConfig => {
  const data: unknown = JSON.parse(raw);
  if (!isJsonObject(data)) {
    throw new Error("Global config must be a JSON object.");
  }

  const config: GlobalConfig = {
    host: readRequiredField(data, "host"),
    adminUser: readRequiredField(data, "adminUser"),
    certbotEmail: readRequiredField(data, "certbotEmail"),
  };
  assertShellSafe("host", config.host);
  assertShellSafe("adminUser", config.adminUser);
  if (!EMAIL_PATTERN.test(config.certbotEmail)) {
    throw new Error(
      `Global config 'certbotEmail' is not a valid email: ${config.certbotEmail}`,
    );
  }
  return config;
};

export const serializeGlobalConfig = (config: GlobalConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;
