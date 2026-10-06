const HBS_EXTENSION = ".hbs";

const RENAMES: Record<string, string> = {
  gitignore: ".gitignore",
  npmrc: ".npmrc",
};

export const isTemplate = (fileName: string): boolean =>
  fileName.endsWith(HBS_EXTENSION);

/**
 * Drop a trailing `.hbs`, then map known dotfile stand-ins to their real name
 * (e.g. `gitignore` → `.gitignore`).
 */
export const outputName = (fileName: string): string => {
  const stripped = isTemplate(fileName)
    ? fileName.slice(0, -HBS_EXTENSION.length)
    : fileName;
  return RENAMES[stripped] ?? stripped;
};
