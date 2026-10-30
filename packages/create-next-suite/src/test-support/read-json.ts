import { readFile } from 'node:fs/promises'

/** Reads and parses a JSON file a test wrote or a run created. */
export const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, 'utf8'))
