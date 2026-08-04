import { randomBytes } from "node:crypto";

import type { ProjectManifest } from "@/generator/manifest";

export const generateSecret = (): string =>
  randomBytes(32).toString("base64url");

export const needsAppUrl = (m: ProjectManifest): boolean =>
  Boolean(m.api) || m.auth === "better-auth";

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

interface ServerEnvContext {
  name: string;
  port: number;
  domain: string;
}

const overrideValue = (
  key: string,
  ctx: ServerEnvContext,
  genSecret: () => string,
): string | undefined => {
  switch (key) {
    case "COMPOSE_PROJECT_NAME":
      return ctx.name;
    case "APP_PORT":
      return String(ctx.port);
    case "POSTGRES_HOST":
      return "postgres";
    case "MYSQL_HOST":
      return "mysql";
    case "NEXT_PUBLIC_APP_URL":
      return `https://${ctx.domain}`;
    case "RESEND_API_KEY":
      return "";
    default:
      return SECRET_KEYS.has(key) ? genSecret() : undefined;
  }
};

/**
 * Builds the server `.env` from the project's own `.env.example`: every line,
 * comment, and blank line stays in place — only known keys get new values. An
 * `APP_PORT` already present is rewritten in place, never appended a second time
 * (where the stale example value would win).
 *
 * `genSecret` defaults to `generateSecret`; the dry-run plan passes a stub so
 * no real secret is ever generated for a preview.
 */
export const deriveServerEnv = (
  example: string,
  ctx: ServerEnvContext,
  genSecret: () => string = generateSecret,
): string => {
  const out: string[] = [];
  let sawComposeProjectName = false;
  const hasAppPort = parseEnvKeys(example).has("APP_PORT");

  for (const rawLine of example.split("\n")) {
    const key = rawLine.trim().match(KEY_LINE)?.[1];
    if (key === undefined) {
      out.push(rawLine);
      continue;
    }
    const override = overrideValue(key, ctx, genSecret);
    out.push(override === undefined ? rawLine : `${key}=${override}`);
    if (key === "COMPOSE_PROJECT_NAME") {
      if (!hasAppPort) out.push(`APP_PORT=${ctx.port}`);
      sawComposeProjectName = true;
    }
  }

  const content = out.join("\n");
  const result = sawComposeProjectName
    ? content
    : `COMPOSE_PROJECT_NAME=${ctx.name}\nAPP_PORT=${ctx.port}\n\n${content}`;
  return result.endsWith("\n") ? result : `${result}\n`;
};

/**
 * `APP_PORT` follows the port registry, so it is the one derived key that has to
 * win over an existing `.env` — the additive merge below would keep a stale one.
 */
export const forceAppPort = (env: string, port: number): string => {
  const withPort = /^APP_PORT=.*$/m.test(env)
    ? env.replace(/^APP_PORT=.*$/m, `APP_PORT=${port}`)
    : `${env}APP_PORT=${port}\n`;
  return withPort.endsWith("\n") ? withPort : `${withPort}\n`;
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
          const key = line.trim().match(KEY_LINE)?.[1];
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
