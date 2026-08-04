export type VersionStatus =
  | { state: "unknown" }
  | { state: "latest" }
  | { state: "outdated"; latest: string };

const parseVersionParts = (version: string): number[] =>
  (version.replace(/^v/, "").split("-")[0] ?? "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);

const isNewer = (a: string, b: string): boolean => {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
};

/**
 * Classify the running `current` version against the registry's `latest` (or
 * `null` when it couldn't be fetched). Only reports "outdated" when `latest` is
 * strictly newer, so a local/dev build ahead of the registry stays "latest".
 */
export const classifyVersion = (
  current: string,
  latest: string | null,
): VersionStatus => {
  if (!latest) return { state: "unknown" };
  return isNewer(latest, current)
    ? { state: "outdated", latest }
    : { state: "latest" };
};
