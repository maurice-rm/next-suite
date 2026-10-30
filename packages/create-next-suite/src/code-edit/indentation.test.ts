import { describe, expect, it } from 'vitest'

import { dedentSnippet, detectIndentUnit } from './indentation.ts'

describe('detectIndentUnit', () => {
  it.each([
    ['tabs', 'a {\n\tb\n}', '\t'],
    ['two spaces', 'a {\n  b {\n    c\n  }\n}', '  '],
    ['four spaces', 'a {\n    b\n}', '    '],
    ['four spaces past a block comment', '/**\n * a\n */\nb {\n    c\n}', '    '],
    ['no indentation', 'a;\nb;', '  '],
    ['spaces despite a tab in a template literal', 'a {\n  b = `\n\tc`\n  d\n}', '  '],
  ])('reads %s', (_case, text, unit) => {
    expect(detectIndentUnit(text)).toBe(unit)
  })
})

describe('dedentSnippet', () => {
  it('takes the indentation of a closing last line away from the lines after the first', () => {
    expect(dedentSnippet('<A>\n      <B />\n    </A>')).toBe('<A>\n  <B />\n</A>')
  })

  it('leaves a snippet with relative indentation as it is', () => {
    expect(dedentSnippet('<Script\n  src="a"\n/>')).toBe('<Script\n  src="a"\n/>')
    expect(dedentSnippet('<Script\n  src="a" />')).toBe('<Script\n  src="a" />')
  })
})
