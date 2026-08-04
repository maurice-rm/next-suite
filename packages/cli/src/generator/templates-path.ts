import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the shipped `templates/` directory. At runtime it sits next
 * to the bundle (`dist/templates`), where tsup copies it during the build.
 */
export const TEMPLATES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "templates",
);
