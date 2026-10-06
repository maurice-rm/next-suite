/**
 * Dependency-freshness check: compares every version pinned in
 * `generator/config/dependencies.ts` (`VERSIONS`) against the npm `latest` tag,
 * and reports what the generated projects would fall behind on.
 *
 * - **Major behind** — the pinned major is older than latest (breaking; the `^`
 *   range does NOT pick this up, so it needs a deliberate bump). For `0.x` pins
 *   the minor counts as the major, which is how `^` treats them too.
 * - **Exact pin behind** — a pin without a `^`/`~` (e.g. `next`) has a newer
 *   version available; users stay on the old one until it is bumped.
 *
 * `^`/`~` ranges that only trail on minor/patch are considered current — a fresh
 * install already resolves the newest within the range. So is a `latest` tag
 * that points at a prerelease (Prisma ships release candidates there).
 *
 * Run: `pnpm --filter create-next-suite deps:check`
 */
import { VERSIONS } from "../src/generator/config/dependencies";

type Kind = "major" | "exact-behind" | "current" | "error";

interface Row {
  name: string;
  pinned: string;
  latest: string;
  kind: Kind;
}

const DECIMAL_RADIX = 10;

const parseVersionParts = (version: string): number[] =>
  (version.replace(/^[^\d]*/, "").split("-")[0] ?? "")
    .split(".")
    .map((part) => parseInt(part, DECIMAL_RADIX) || 0);

const isExactPin = (pin: string): boolean => /^\d/.test(pin.trim());

const isNewer = (candidate: number[], baseline: number[]): boolean => {
  const length = Math.max(candidate.length, baseline.length);
  for (let index = 0; index < length; index++) {
    const difference = (candidate[index] ?? 0) - (baseline[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

const isPrerelease = (version: string): boolean => version.includes("-");

// Below 1.0.0 the minor is the breaking segment, so ^0.27.3 does not reach 0.28.
const getBreakingIndex = (pinned: number[], latest: number[]): number =>
  (pinned[0] ?? 0) === 0 && (latest[0] ?? 0) === 0 ? 1 : 0;

const classify = (pinned: string, latest: string): Kind => {
  if (isPrerelease(latest) && !isPrerelease(pinned)) return "current";
  const pinnedParts = parseVersionParts(pinned);
  const latestParts = parseVersionParts(latest);
  const breakingIndex = getBreakingIndex(pinnedParts, latestParts);
  if ((latestParts[breakingIndex] ?? 0) > (pinnedParts[breakingIndex] ?? 0)) {
    return "major";
  }
  if (isExactPin(pinned) && isNewer(latestParts, pinnedParts)) {
    return "exact-behind";
  }
  return "current";
};

const readVersion = (manifest: unknown): string | undefined =>
  typeof manifest === "object" &&
  manifest !== null &&
  "version" in manifest &&
  typeof manifest.version === "string"
    ? manifest.version
    : undefined;

const fetchLatest = async (name: string): Promise<string | undefined> => {
  try {
    const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!response.ok) return undefined;
    const manifest: unknown = await response.json();
    return readVersion(manifest);
  } catch {
    return undefined;
  }
};

const rows: Row[] = await Promise.all(
  Object.entries(VERSIONS).map(async ([name, pinned]): Promise<Row> => {
    const latest = await fetchLatest(name);
    return latest
      ? { name, pinned, latest, kind: classify(pinned, latest) }
      : { name, pinned, latest: "?", kind: "error" };
  }),
);

const width = Math.max(...rows.map((row) => row.name.length));

const printSection = (title: string, kind: Kind): void => {
  const items = rows.filter((row) => row.kind === kind);
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const row of items) {
    console.log(`  ${row.name.padEnd(width)}  ${row.pinned}  →  ${row.latest}`);
  }
};

console.log("Dependency freshness — pinned VERSIONS vs the npm `latest` tag");
printSection(
  "⚠  Major updates available (breaking — review before bumping):",
  "major",
);
printSection(
  "·  Exact pins behind latest (bump to pick up fixes):",
  "exact-behind",
);
printSection("✗  Could not check (not found / offline):", "error");

const countRows = (kind: Kind): number =>
  rows.filter((row) => row.kind === kind).length;
const uncheckedCount = countRows("error");
console.log(
  `\nSummary: ${String(countRows("major"))} major, ${String(countRows("exact-behind"))} exact-pin behind, ` +
    `${String(countRows("current"))} current${uncheckedCount > 0 ? `, ${String(uncheckedCount)} unchecked` : ""}.`,
);
