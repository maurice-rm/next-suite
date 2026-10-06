const REGISTRY_URL = "https://registry.npmjs.org";
/** Upper bound on the lookup; the banner only uses the result cosmetically. */
const DEFAULT_TIMEOUT_MS = 700;

/**
 * Resolve the latest version published to the npm registry for
 * `packageName`, or `null`
 * when it can't be determined — offline, a 404 for an unpublished package, any
 * non-OK response, a malformed payload, or the bounded request timing out. The
 * banner uses this purely cosmetically, so every failure mode is swallowed.
 */
export const fetchLatestVersion = async (
  packageName: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> => {
  try {
    const response = await fetch(`${REGISTRY_URL}/${packageName}/latest`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
};
