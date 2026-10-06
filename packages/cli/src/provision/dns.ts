import { resolve4 } from "node:dns/promises";

const MAX_HOSTNAME_LENGTH = 253;

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

// Lookup failures that mean "not verifiable right now" rather than a bug; the
// caller turns them into a warning, as a missing record is.
const UNRESOLVABLE_CODES: ReadonlySet<unknown> = new Set([
  "ENOTFOUND",
  "ENODATA",
  "ETIMEOUT",
  "ESERVFAIL",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

export const isValidHostname = (domain: string): boolean => {
  if (domain.length === 0 || domain.length > MAX_HOSTNAME_LENGTH) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => LABEL.test(label));
};

/** A domain from an untrusted source (remote conf, CLI flag) — only usable once it passes hostname shape rules, since it flows unescaped into shell commands. */
export const toTrustedDomain = (raw: string | undefined): string | undefined =>
  raw !== undefined && isValidHostname(raw) ? raw : undefined;

type Lookup = (domain: string) => Promise<string[]>;

const isUnresolvableError = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  UNRESOLVABLE_CODES.has(error.code);

export const resolvesToAny = async (
  domain: string,
  ips: readonly string[],
  lookup: Lookup = resolve4,
): Promise<boolean> => {
  try {
    const records = await lookup(domain);
    return records.some((record) => ips.includes(record));
  } catch (error) {
    if (isUnresolvableError(error)) return false;
    throw error;
  }
};
