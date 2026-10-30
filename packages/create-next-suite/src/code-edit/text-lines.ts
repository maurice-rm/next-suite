/** The offset where the line holding `offset` starts. */
export const lineStartOf = (text: string, offset: number): number =>
  text.lastIndexOf('\n', offset - 1) + 1

/** The offset of the line break that ends the line holding `offset`, or the end of the text. */
export const lineEndOf = (text: string, offset: number): number => {
  const end = text.indexOf('\n', offset)
  return end === -1 ? text.length : end
}

export const hasLineBreak = (text: string, start: number, end: number): boolean =>
  text.slice(start, end).includes('\n')

/** Whether only whitespace shares the lines of the range. */
export const isAloneOnLine = (text: string, start: number, end: number): boolean =>
  text.slice(lineStartOf(text, start), start).trim() === '' &&
  text.slice(end, lineEndOf(text, end)).trim() === ''
