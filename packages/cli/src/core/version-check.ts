export type VersionStatus =
  | { state: "unknown" }
  | { state: "latest" }
  | { state: "outdated"; latest: string };

const parseVersionParts = (version: string): number[] =>
  (version.replace(/^v/, "").split("-")[0] ?? "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);

const isNewer = (candidate: string, baseline: string): boolean => {
  const candidateParts = parseVersionParts(candidate);
  const baselineParts = parseVersionParts(baseline);
  const length = Math.max(candidateParts.length, baselineParts.length);
  for (let i = 0; i < length; i++) {
    const candidatePart = candidateParts[i] ?? 0;
    const baselinePart = baselineParts[i] ?? 0;
    if (candidatePart !== baselinePart) return candidatePart > baselinePart;
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
