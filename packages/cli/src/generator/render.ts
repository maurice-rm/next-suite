import path from "node:path";

import fs from "fs-extra";

import { renderString } from "./engine";
import { isMergeable } from "./merge";
import { isTemplate, outputName } from "./naming";

export type FileMap = Map<string, string | Buffer>;

export type Fragments = Map<string, string[]>;

interface RenderOutput {
  fileMap: FileMap;
  fragments: Fragments;
}

export const pushFragment = (
  fragments: Fragments,
  key: string,
  value: string,
): void => {
  const bucket = fragments.get(key) ?? [];
  bucket.push(value);
  fragments.set(key, bucket);
};

const joinRelativePath = (prefix: string, name: string): string =>
  prefix ? `${prefix}/${name}` : name;

const readContent = async (
  sourcePath: string,
  data: unknown,
): Promise<string | Buffer> => {
  const bytes = await fs.readFile(sourcePath);
  const text = bytes.toString("utf8");
  if (isTemplate(sourcePath)) return renderString(text, data);
  return Buffer.from(text, "utf8").equals(bytes) ? text : bytes;
};

/**
 * Render one template layer into the shared output. `.hbs` files are rendered
 * with Handlebars; root-level mergeable files (package.json, .env.example,
 * .prettierrc.json) are routed to `fragments`; everything else is set in
 * `fileMap`, where a later layer overwrites an earlier one at the same path.
 */
export const renderLayer = async (
  layerDir: string,
  data: unknown,
  output: RenderOutput,
): Promise<void> => {
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const sourcePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(sourcePath, joinRelativePath(prefix, entry.name));
        continue;
      }
      const name = outputName(entry.name);
      const content = await readContent(sourcePath, data);
      if (prefix === "" && isMergeable(name) && typeof content === "string") {
        pushFragment(output.fragments, name, content);
        continue;
      }
      output.fileMap.set(joinRelativePath(prefix, name), content);
    }
  };
  await walk(layerDir, "");
};
