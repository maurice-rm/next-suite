/** A file of one entry per line, such as `.gitignore`. */
export type LineList = {
  /** Appends a line the file does not have yet. */
  add: (line: string) => void
  /** The file's text: the original byte for byte, then the added lines. */
  print: () => string
}

export const openLineList = (text: string): LineList => {
  const present = new Set(text.split('\n'))
  const added: string[] = []
  return {
    add: (line) => {
      if (!present.has(line)) {
        present.add(line)
        added.push(line)
      }
    },
    print: () => {
      if (added.length === 0) {
        return text
      }
      const original = text === '' || text.endsWith('\n') ? text : `${text}\n`
      return `${original}${added.join('\n')}\n`
    },
  }
}
