import fs from "node:fs/promises";

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const readFileIfExists = async (
  file: string,
): Promise<string | undefined> => {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
};

export const isExistingFile = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
};
