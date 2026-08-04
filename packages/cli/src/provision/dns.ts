import { resolve4 } from "node:dns/promises";

const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i;

export const isValidHostname = (domain: string): boolean => {
  if (domain.length === 0 || domain.length > 253) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((l) => LABEL.test(l));
};

type Lookup = (domain: string) => Promise<string[]>;

export const resolvesToAny = async (
  domain: string,
  ips: readonly string[],
  lookup: Lookup = resolve4,
): Promise<boolean> => {
  try {
    const records = await lookup(domain);
    return records.some((r) => ips.includes(r));
  } catch {
    return false;
  }
};
