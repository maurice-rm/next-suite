/**
 * Dependency-free Node-version gate so the CLI can verify the host runtime
 * before doing any work (the published `engines.node` is only advisory).
 */

const VERSION_PATTERN = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/;

const parseVersion = (value: string): [number, number, number] => {
  const match = VERSION_PATTERN.exec(value);
  if (!match) throw new Error(`Unparseable Node version: "${value}".`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
};

/**
 * Whether `current` satisfies the lower bound of an `engines.node` range. Only
 * the floor is considered — enough for a "you need at least Node X" gate.
 *
 * @param current - The running Node version, e.g. `process.versions.node` ("22.3.1").
 * @param range - An engines range whose minimum is enforced, e.g. ">=22.0.0".
 * @returns `true` when `current` is at least the range's floor.
 */
export const satisfiesNodeRange = (current: string, range: string): boolean => {
  const [currentMajor, currentMinor, currentPatch] = parseVersion(current);
  const [floorMajor, floorMinor, floorPatch] = parseVersion(range);
  if (currentMajor !== floorMajor) return currentMajor > floorMajor;
  if (currentMinor !== floorMinor) return currentMinor > floorMinor;
  return currentPatch >= floorPatch;
};
