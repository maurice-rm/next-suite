/** Wraps a shell word in single quotes so it can't break out onto a second command. */
export const quoteShellWord = (word: string): string =>
  `'${word.replace(/'/g, "'\\''")}'`;
