import path from "node:path";

import fs from "fs-extra";

import { renderString } from "./engine";
import { isMergeable } from "./merge";
import { isTemplate, outputName } from "./naming";

export type FileMap = Map<string, string | Buffer>;

export type Fragments = Map<string, string[]>;

/** Append a rendered fragment to its per-file bucket, creating the bucket lazily. */
export const pushFragment = (
  fragments: Fragments,
  key: string,
  value: string,
): void => {
  const bucket = fragments.get(key) ?? [];
  bucket.push(value);
  fragments.set(key, bucket);
};

/**
 * Render one template layer into the shared FileMap and fragment collectors.
 * `.hbs` files are rendered with Handlebars; root-level mergeable files
 * (package.json / .env.example) are routed to `fragments`; everything else is
 * set in `fileMap` (a later layer overwrites an earlier one at the same path).
 *
 * @param layerDir - Absolute path to the layer's template directory.
 * @param data - Values exposed to every template.
 * @param fileMap - Accumulates normal output files.
 * @param fragments - Accumulates mergeable fragment contents.
 */
export const renderLayer = async (
  layerDir: string,
  data: unknown,
  fileMap: FileMap,
  fragments: Fragments,
): Promise<void> => {
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const src = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(src, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }
      const name = outputName(entry.name);
      const bytes = await fs.readFile(src);
      const text = bytes.toString("utf8");
      const isText = Buffer.from(text, "utf8").equals(bytes);
      const content: string | Buffer = isTemplate(entry.name)
        ? renderString(text, data)
        : isText
          ? text
          : bytes;
      if (prefix === "" && isMergeable(name) && typeof content === "string") {
        pushFragment(fragments, name, content);
      } else {
        fileMap.set(prefix ? `${prefix}/${name}` : name, content);
      }
    }
  };
  await walk(layerDir, "");
};
