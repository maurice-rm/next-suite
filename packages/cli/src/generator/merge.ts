const MERGED_OBJECT_FIELDS = ["dependencies", "devDependencies", "scripts"];

const MERGED_OBJECT_FIELD_SET = new Set(MERGED_OBJECT_FIELDS);

const PLUGINS_FIELD = "plugins";

const ENV_COMMENT_PREFIX = "#";

const ENV_BLOCK_SEPARATOR = /\n{2,}/;

type JsonObject = Record<string, unknown>;

interface EnvEntry {
  key: string;
  value: string;
}

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const sortKeys = (record: JsonObject): JsonObject =>
  Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );

const fragmentError = (options: {
  label: string;
  index: number;
  reason: string;
  cause?: unknown;
}): Error =>
  new Error(
    `Invalid ${options.label} fragment at index ${String(options.index)}: ${options.reason}.`,
    { cause: options.cause },
  );

const parseJsonFragment = (
  fragment: string,
  index: number,
  label: string,
): JsonObject => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fragment);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw fragmentError({ label, index, reason, cause: error });
  }
  if (!isJsonObject(parsed)) {
    throw fragmentError({ label, index, reason: "it is not a JSON object" });
  }
  return parsed;
};

const mergeObjectField = (
  existing: unknown,
  incoming: unknown,
  location: { index: number; key: string },
): JsonObject => {
  if (!isJsonObject(incoming)) {
    throw fragmentError({
      label: "package.json",
      index: location.index,
      reason: `"${location.key}" is not an object`,
    });
  }
  return { ...(isJsonObject(existing) ? existing : {}), ...incoming };
};

/**
 * Merge package.json fragments (base first) into one manifest. Scalar top-level
 * fields take the last layer's value; dependency/script maps are unioned (last
 * wins on conflict) and emitted with sorted keys.
 *
 * @throws If a fragment is not a valid JSON object.
 */
export const mergePackageJson = (fragments: string[]): string => {
  const merged: JsonObject = {};
  for (const [index, fragment] of fragments.entries()) {
    const parsed = parseJsonFragment(fragment, index, "package.json");
    for (const [key, value] of Object.entries(parsed)) {
      merged[key] = MERGED_OBJECT_FIELD_SET.has(key)
        ? mergeObjectField(merged[key], value, { index, key })
        : value;
    }
  }
  for (const field of MERGED_OBJECT_FIELDS) {
    const map = merged[field];
    if (isJsonObject(map)) merged[field] = sortKeys(map);
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
};

const parseEnvEntry = (trimmedLine: string): EnvEntry | undefined => {
  const separatorIndex = trimmedLine.indexOf("=");
  if (separatorIndex === -1) return undefined;
  return {
    key: trimmedLine.slice(0, separatorIndex).trim(),
    value: trimmedLine.slice(separatorIndex + 1).trim(),
  };
};

const isEnvComment = (trimmedLine: string): boolean =>
  trimmedLine.startsWith(ENV_COMMENT_PREFIX);

const collectEnvValues = (fragments: string[]): Map<string, string> => {
  const values = new Map<string, string>();
  const lines = fragments.flatMap((fragment) => fragment.split("\n"));
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || isEnvComment(trimmed)) continue;
    const entry = parseEnvEntry(trimmed);
    if (entry) values.set(entry.key, entry.value);
  }
  return values;
};

const renderEnvBlock = (
  rawBlock: string,
  values: Map<string, string>,
  emitted: Set<string>,
): string | undefined => {
  const comments: string[] = [];
  const lines: string[] = [];
  for (const line of rawBlock.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (isEnvComment(trimmed)) {
      comments.push(trimmed);
      continue;
    }
    const entry = parseEnvEntry(trimmed);
    if (!entry || emitted.has(entry.key)) continue;
    emitted.add(entry.key);
    lines.push(`${entry.key}=${values.get(entry.key) ?? entry.value}`);
  }
  return lines.length > 0 ? [...comments, ...lines].join("\n") : undefined;
};

/**
 * Merge .env fragments, preserving their block structure: a block is a run of
 * comment + `KEY=value` lines separated by blank lines, so fragments can ship
 * `# Section` headers. A key stays in the block that mentions it first while
 * the LAST fragment's value wins, and a block whose every key was already
 * emitted disappears together with its comments. Only the first `=` splits a
 * line, so an `=` inside a value is preserved.
 */
export const mergeEnv = (fragments: string[]): string => {
  const values = collectEnvValues(fragments);
  const emitted = new Set<string>();
  const blocks = fragments
    .flatMap((fragment) => fragment.split(ENV_BLOCK_SEPARATOR))
    .map((rawBlock) => renderEnvBlock(rawBlock, values, emitted))
    .filter((block) => block !== undefined);
  return `${blocks.join("\n\n")}\n`;
};

const appendPlugins = (plugins: string[], incoming: string[]): void => {
  for (const plugin of incoming) {
    const existingIndex = plugins.indexOf(plugin);
    if (existingIndex !== -1) plugins.splice(existingIndex, 1);
    plugins.push(plugin);
  }
};

const readPlugins = (value: unknown, index: number): string[] => {
  if (!isStringArray(value)) {
    throw fragmentError({
      label: ".prettierrc.json",
      index,
      reason: `"${PLUGINS_FIELD}" is not an array of strings`,
    });
  }
  return value;
};

/**
 * Merge .prettierrc.json fragments (base first): scalar options take the last
 * layer's value; `plugins` arrays are concatenated in layer order and deduped
 * last-seen-wins, so a plugin a later layer re-declares moves to the end —
 * which is how prettier-plugin-tailwindcss is guaranteed to run last.
 *
 * @throws If a fragment is not a valid JSON object.
 */
export const mergePrettierConfig = (fragments: string[]): string => {
  const merged: JsonObject = {};
  const plugins: string[] = [];
  for (const [index, fragment] of fragments.entries()) {
    const { [PLUGINS_FIELD]: fragmentPlugins, ...options } = parseJsonFragment(
      fragment,
      index,
      ".prettierrc.json",
    );
    Object.assign(merged, options);
    if (fragmentPlugins !== undefined) {
      appendPlugins(plugins, readPlugins(fragmentPlugins, index));
    }
  }
  if (plugins.length > 0) merged[PLUGINS_FIELD] = plugins;
  return `${JSON.stringify(merged, null, 2)}\n`;
};

interface Mergeable {
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
