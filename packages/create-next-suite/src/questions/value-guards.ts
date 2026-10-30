export const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Whether typed text is a finite number; blank text is none, though `Number('')` is 0. */
export const isNumberText = (value: string): boolean =>
  value.trim() !== '' && Number.isFinite(Number(value))
