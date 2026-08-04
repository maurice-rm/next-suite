export type PackageManager = "npm" | "pnpm" | "bun" | "yarn";

/** One supported package manager — an entry in {@link PACKAGE_MANAGERS}. */
export interface PackageManagerEntry {
  /** Matched against `npm_config_user_agent` for auto-detection. */
  id: PackageManager;
  /** Human label shown in the package-manager prompt. */
  label: string;
  /** Rendered verbatim into generated scripts (e.g. husky hooks) as the local-binary runner. */
  exec: string;
  /**
   * DLX prefix: fetch and run a package one-off. A command + args list, spawned
   * directly (no shell) — distinct from {@link PackageManagerEntry.exec}.
   */
  dlx: readonly [string, ...string[]];
  /**
   * Extra environment for `install`, when the manager needs it. Yarn's
   * hardened/immutable mode (common in CI) otherwise rejects a fresh scaffold's
   * first install because there is no lockfile yet.
   */
  installEnv?: NodeJS.ProcessEnv;
}

/**
 * The supported package managers — the single source of truth, in prompt
 * display order. A leaf module: it imports nothing from the layers, so
 * core/prompts/generator/post-steps can all read from it without creating a
 * cycle. Adding a package manager is an edit here (the id union plus an entry).
 */
export const PACKAGE_MANAGERS: readonly PackageManagerEntry[] = [
  { id: "npm", label: "npm", exec: "npx --no --", dlx: ["npx"] },
  { id: "pnpm", label: "pnpm", exec: "pnpm exec", dlx: ["pnpm", "dlx"] },
  { id: "bun", label: "Bun", exec: "bunx", dlx: ["bunx"] },
  {
    id: "yarn",
    label: "Yarn",
    exec: "yarn exec",
    dlx: ["yarn", "dlx"],
    installEnv: {
      YARN_ENABLE_HARDENED_MODE: "0",
      YARN_ENABLE_IMMUTABLE_INSTALLS: "false",
    },
  },
];

/**
 * The registry entry for a package manager, or `undefined` when `id` is not a
 * known manager — the single lookup for detection/flag paths that must tolerate
 * arbitrary input.
 *
 * @param id - A candidate package manager id.
 * @returns The matching {@link PackageManagerEntry}, or `undefined`.
 */
export const findPackageManagerEntry = (
  id: string | undefined,
): PackageManagerEntry | undefined =>
  PACKAGE_MANAGERS.find((entry) => entry.id === id);

/**
 * The registry entry for a known package manager.
 *
 * @param id - The package manager id.
 * @returns Its {@link PackageManagerEntry}.
 * @throws If no entry matches `id`.
 */
export const getPackageManagerEntry = (
  id: PackageManager,
): PackageManagerEntry => {
  const entry = findPackageManagerEntry(id);
  if (!entry) throw new Error(`Unknown package manager: ${id}.`);
  return entry;
};
