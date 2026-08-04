import os from "node:os";
import path from "node:path";

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

const FIELDS = ["host", "adminUser", "certbotEmail"] as const;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SHELL_SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const parseGlobalConfig = (raw: string): GlobalConfig => {
  const data = JSON.parse(raw) as unknown;

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Global config must be a JSON object.");
  }

  const config = data as Record<string, unknown>;

  for (const field of FIELDS) {
    if (typeof config[field] !== "string" || config[field] === "") {
      throw new Error(`Global config is missing '${field}'.`);
    }
  }

  for (const field of ["host", "adminUser"] as const) {
    if (!SHELL_SAFE.test(config[field] as string)) {
      throw new Error(
        `Global config '${field}' may only contain letters, digits, dot, dash and underscore, and may not start with a dash: ${String(config[field])}`,
      );
    }
  }

  const certbotEmail = config.certbotEmail as string;
  if (!EMAIL_PATTERN.test(certbotEmail)) {
    throw new Error(
      `Global config 'certbotEmail' is not a valid email: ${certbotEmail}`,
    );
  }

  return {
    host: config.host as string,
    adminUser: config.adminUser as string,
    certbotEmail,
  };
};

export const serializeGlobalConfig = (c: GlobalConfig): string =>
  `${JSON.stringify(c, null, 2)}\n`;
