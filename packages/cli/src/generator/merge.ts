const MERGED_OBJECT_FIELDS = [
  "dependencies",
  "devDependencies",
  "scripts",
] as const;

const MERGED_OBJECT_FIELD_SET = new Set<string>(MERGED_OBJECT_FIELDS);

const sortKeys = (record: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );

const parseJsonFragment = (
  fragment: string,
  index: number,
  label: string,
): Record<string, unknown> => {
  try {
    return JSON.parse(fragment) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid ${label} fragment at index ${index}: ${(error as Error).message}.`,
    );
  }
};

/**
 * Merge package.json fragments (base first) into one manifest. Scalar top-level
 * fields take the last layer's value; dependency/script maps are unioned (last
 * wins on conflict) and emitted with sorted keys.
 *
 * @param fragments - Rendered package.json strings, base-first.
 * @returns The merged manifest as a 2-space-indented JSON string.
 * @throws If a fragment is not valid JSON.
 */
export const mergePackageJson = (fragments: string[]): string => {
  const merged: Record<string, unknown> = {};
  for (const [index, fragment] of fragments.entries()) {
    const parsed = parseJsonFragment(fragment, index, "package.json");
    for (const [key, value] of Object.entries(parsed)) {
      if (MERGED_OBJECT_FIELD_SET.has(key)) {
        merged[key] = {
          ...(merged[key] as Record<string, string> | undefined),
          ...(value as Record<string, string>),
        };
      } else {
        merged[key] = value;
      }
    }
  }
  for (const field of MERGED_OBJECT_FIELDS) {
    const map = merged[field] as Record<string, string> | undefined;
    if (map) merged[field] = sortKeys(map);
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
};

/**
 * Merge .env fragments, preserving their block structure: a block is a run of
 * comment + `KEY=value` lines separated by blank lines, so fragments can ship
 * `# Section` headers. Keys are deduped across all fragments (a key stays in
 * the block that mentions it first; the LAST fragment's value wins), a block
 * whose every key was already emitted disappears together with its comments,
 * and blocks are joined by exactly one blank line. Whitespace around the key
 * and value is trimmed; only the first `=` splits a line, so an `=` inside a
 * value is preserved.
 *
 * @param fragments - Rendered .env blocks, base-first.
 * @returns The merged env content (trailing newline).
 */
export const mergeEnv = (fragments: string[]): string => {
  const values = new Map<string, string>();
  for (const fragment of fragments) {
    for (const line of fragment.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      values.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
    }
  }

  const emitted = new Set<string>();
  const blocks: string[] = [];
  for (const fragment of fragments) {
    for (const rawBlock of fragment.split(/\n{2,}/)) {
      const comments: string[] = [];
      const lines: string[] = [];
      for (const line of rawBlock.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        if (trimmed.startsWith("#")) {
          comments.push(trimmed);
          continue;
        }
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        if (emitted.has(key)) continue;
        emitted.add(key);
        lines.push(`${key}=${values.get(key)}`);
      }
      if (lines.length > 0) blocks.push([...comments, ...lines].join("\n"));
    }
  }
  return `${blocks.join("\n\n")}\n`;
};

/**
 * Merge .prettierrc.json fragments (base first): scalar options take the last
 * layer's value; `plugins` arrays are concatenated in layer order and deduped
 * last-seen-wins, so a plugin a later layer re-declares moves to the end —
 * which is how prettier-plugin-tailwindcss is guaranteed to run last.
 *
 * @param fragments - Rendered .prettierrc.json strings, base-first.
 * @returns The merged config as a 2-space-indented JSON string.
 * @throws If a fragment is not valid JSON.
 */
export const mergePrettierConfig = (fragments: string[]): string => {
  const merged: Record<string, unknown> = {};
  const plugins: string[] = [];
  for (const [index, fragment] of fragments.entries()) {
    const parsed = parseJsonFragment(fragment, index, ".prettierrc.json");
    for (const [key, value] of Object.entries(parsed)) {
      if (key === "plugins") {
        for (const plugin of value as string[]) {
          const existing = plugins.indexOf(plugin);
          if (existing !== -1) plugins.splice(existing, 1);
          plugins.push(plugin);
        }
      } else {
        merged[key] = value;
      }
    }
  }
  if (plugins.length) merged.plugins = plugins;
  return `${JSON.stringify(merged, null, 2)}\n`;
};

export interface Mergeable {
  file: string;
  merge: (fragments: string[]) => string;
}

export const MERGEABLES: Mergeable[] = [
  { file: "package.json", merge: mergePackageJson },
  { file: ".env.example", merge: mergeEnv },
  { file: ".prettierrc.json", merge: mergePrettierConfig },
];

const MERGEABLE_FILES = new Set(MERGEABLES.map((mergeable) => mergeable.file));

export const isMergeable = (name: string): boolean => MERGEABLE_FILES.has(name);
