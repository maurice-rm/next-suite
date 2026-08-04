const HBS_EXTENSION = ".hbs";

const RENAMES: Record<string, string> = { gitignore: ".gitignore" };

export const isTemplate = (fileName: string): boolean =>
  fileName.endsWith(HBS_EXTENSION);

/**
 * Compute a rendered file's output name: drop a trailing `.hbs`, then map known
 * dotfile stand-ins to their real name (e.g. `gitignore` → `.gitignore`).
 *
 * @param fileName - The template file name (may carry a `.hbs` extension).
 * @returns The final output file name.
 */
export const outputName = (fileName: string): string => {
  const stripped = isTemplate(fileName)
    ? fileName.slice(0, -HBS_EXTENSION.length)
    : fileName;
  return RENAMES[stripped] ?? stripped;
};
