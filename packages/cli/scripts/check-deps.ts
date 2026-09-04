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

const parts = (version: string): number[] =>
  (version.replace(/^[^\d]*/, "").split("-")[0] ?? "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);

const isExactPin = (pin: string): boolean => /^\d/.test(pin.trim());

const isNewer = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
};

const isPrerelease = (version: string): boolean => version.includes("-");

// Below 1.0.0 the minor is the breaking segment, so ^0.27.3 does not reach 0.28.
const breakingIndex = (p: number[], l: number[]): number =>
  (p[0] ?? 0) === 0 && (l[0] ?? 0) === 0 ? 1 : 0;

const classify = (pinned: string, latest: string): Kind => {
  if (isPrerelease(latest) && !isPrerelease(pinned)) return "current";
  const p = parts(pinned);
  const l = parts(latest);
  const i = breakingIndex(p, l);
  if ((l[i] ?? 0) > (p[i] ?? 0)) return "major";
  if (isExactPin(pinned) && isNewer(l, p)) return "exact-behind";
  return "current";
};

const fetchLatest = async (name: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://registry.npmjs.org/${name}/latest`);
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
};

const rows: Row[] = await Promise.all(
  Object.entries(VERSIONS).map(async ([name, pinned]) => {
    const latest = await fetchLatest(name);
    return latest
      ? { name, pinned, latest, kind: classify(pinned, latest) }
      : { name, pinned, latest: "?", kind: "error" as const };
  }),
);

const width = Math.max(...rows.map((r) => r.name.length));

const printSection = (title: string, kind: Kind): void => {
  const items = rows.filter((r) => r.kind === kind);
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const r of items) {
    console.log(`  ${r.name.padEnd(width)}  ${r.pinned}  →  ${r.latest}`);
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

const count = (kind: Kind): number =>
  rows.filter((r) => r.kind === kind).length;
console.log(
  `\nSummary: ${count("major")} major, ${count("exact-behind")} exact-pin behind, ` +
    `${count("current")} current${count("error") ? `, ${count("error")} unchecked` : ""}.`,
);
