import { randomBytes } from "node:crypto";

import type { ProjectManifest } from "@/generator/manifest";

const SECRET_BYTES = 32;

export const generateSecret = (): string =>
  randomBytes(SECRET_BYTES).toString("base64url");

const needsAppUrl = (manifest: ProjectManifest): boolean =>
  Boolean(manifest.api) || manifest.auth === "better-auth";

export const buildAppUrl = (domain: string): string => `https://${domain}`;

export const resolveAppUrl = (
  manifest: ProjectManifest,
  domain: string,
): string | undefined =>
  needsAppUrl(manifest) ? buildAppUrl(domain) : undefined;

/** Keys whose values are secrets — redacted in the dry-run plan. */
const SECRET_KEYS: ReadonlySet<string> = new Set([
  "POSTGRES_PASSWORD",
  "MYSQL_PASSWORD",
  "BETTER_AUTH_SECRET",
]);

export const parseEnvKeys = (env: string): Set<string> => {
  const keys = new Set<string>();
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) keys.add(trimmed.slice(0, eq));
  }
  return keys;
};

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=.*$/;

const readLineKey = (line: string): string | undefined =>
  KEY_LINE.exec(line.trim())?.[1];

export const readEnvValue = (env: string, key: string): string | undefined =>
  new RegExp(`^${key}=(.*)$`, "m").exec(env)?.[1];

interface ServerEnvContext {
  name: string;
  port: number;
  domain: string;
}

const overrideValue = (
  key: string,
  context: ServerEnvContext,
  createSecret: () => string,
): string | undefined => {
  switch (key) {
    case "COMPOSE_PROJECT_NAME":
      return context.name;
    case "APP_PORT":
      return String(context.port);
    case "POSTGRES_HOST":
      return "postgres";
    case "MYSQL_HOST":
      return "mysql";
    case "NEXT_PUBLIC_APP_URL":
      return buildAppUrl(context.domain);
    case "RESEND_API_KEY":
      return "";
    default:
      return SECRET_KEYS.has(key) ? createSecret() : undefined;
  }
};

const ensureTrailingNewline = (text: string): string =>
  text.endsWith("\n") ? text : `${text}\n`;

const deriveLine = (
  rawLine: string,
  context: ServerEnvContext,
  createSecret: () => string,
): string => {
  const key = readLineKey(rawLine);
  if (key === undefined) return rawLine;
  const override = overrideValue(key, context, createSecret);
  return override === undefined ? rawLine : `${key}=${override}`;
};

/**
 * Builds the server `.env` from the project's own `.env.example`: every line,
 * comment, and blank line stays in place — only known keys get new values. An
 * `APP_PORT` already present is rewritten in place, never appended a second time
 * (where the stale example value would win).
 *
 * `createSecret` defaults to `generateSecret`; the dry-run plan passes a stub so
 * no real secret is ever generated for a preview.
 */
export const deriveServerEnv = (
  example: string,
  context: ServerEnvContext,
  createSecret: () => string = generateSecret,
): string => {
  const port = String(context.port);
  const hasAppPort = parseEnvKeys(example).has("APP_PORT");
  const output: string[] = [];
  let hasComposeProjectName = false;

  for (const rawLine of example.split("\n")) {
    output.push(deriveLine(rawLine, context, createSecret));
    if (readLineKey(rawLine) !== "COMPOSE_PROJECT_NAME") continue;
    if (!hasAppPort) output.push(`APP_PORT=${port}`);
    hasComposeProjectName = true;
  }

  const content = output.join("\n");
  return ensureTrailingNewline(
    hasComposeProjectName
      ? content
      : `COMPOSE_PROJECT_NAME=${context.name}\nAPP_PORT=${port}\n\n${content}`,
  );
};

const APP_PORT_LINE = /^APP_PORT=.*$/m;

/**
 * `APP_PORT` follows the port registry, so it is the one derived key that has to
 * win over an existing `.env` — the additive merge below would keep a stale one.
 */
export const forceAppPort = (env: string, port: number): string => {
  const line = `APP_PORT=${String(port)}`;
  return ensureTrailingNewline(
    APP_PORT_LINE.test(env)
      ? env.replace(APP_PORT_LINE, line)
      : `${env}${line}\n`,
  );
};

/**
 * Adds only the keys `existing` is missing from `desired`'s blank-line-separated
 * blocks — a block's comments travel with it and survive only if one of its keys
 * survives. Returns `existing` verbatim when nothing is missing.
 */
export const mergeEnv = (existing: string, desired: string): string => {
  const present = parseEnvKeys(existing);
  if (present.size === 0) return desired;

  const survivingBlocks = desired
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .filter((line) => {
          const key = readLineKey(line);
          return key === undefined || !present.has(key);
        })
        .join("\n"),
    )
    .filter((block) => parseEnvKeys(block).size > 0);

  if (survivingBlocks.length === 0) return existing;

  const prefix =
    existing.length > 0 && !existing.endsWith("\n")
      ? `${existing}\n`
      : existing;
  return `${prefix}${survivingBlocks.join("\n\n")}\n`;
};
