/** Key presses as a terminal sends them, for tests that drive prompts. */
export const KEYS = {
  enter: '\r',
  up: '\u001b[A',
  ctrlC: '\u0003',
} as const
