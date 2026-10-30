const LEADING_IMPORT = /^(?:@import [^\n]*\n)*/

/** The global stylesheet: the imports it starts with, the rest kept byte for byte. */
export type Stylesheet = {
  /** Adds `@import "<specifier>";` after the imports the file starts with, unless it is there. */
  addImport: (specifier: string) => void
  print: () => string
}

const renderImport = (specifier: string): string => `@import ${JSON.stringify(specifier)};\n`

export const openStylesheet = (text: string): Stylesheet => {
  const added: string[] = []
  return {
    addImport: (specifier) => {
      const line = renderImport(specifier)
      if (!added.includes(line) && !text.split('\n').includes(line.trimEnd())) {
        added.push(line)
      }
    },
    print: () => {
      const imports = LEADING_IMPORT.exec(text)?.[0] ?? ''
      return `${imports}${added.join('')}${text.slice(imports.length)}`
    },
  }
}
