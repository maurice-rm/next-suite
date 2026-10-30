import { describe, expect, it } from 'vitest'

import { openStylesheet } from './stylesheet.ts'

const BASE = ':root {\n  color-scheme: light dark;\n}\n'

describe('openStylesheet', () => {
  it('puts imports first, each once, and keeps the rest byte for byte', () => {
    const stylesheet = openStylesheet(BASE)
    stylesheet.addImport('tailwindcss')
    stylesheet.addImport('tw-animate-css')
    stylesheet.addImport('tailwindcss')

    expect(stylesheet.print()).toBe(`@import "tailwindcss";\n@import "tw-animate-css";\n${BASE}`)
  })

  it('adds imports after the ones the file has and skips one it imports already', () => {
    const stylesheet = openStylesheet(`@import "tailwindcss";\n\n${BASE}`)
    stylesheet.addImport('tailwindcss')
    stylesheet.addImport('tw-animate-css')

    expect(stylesheet.print()).toBe(`@import "tailwindcss";\n@import "tw-animate-css";\n\n${BASE}`)
  })

  it('prints an unchanged file as it was', () => {
    expect(openStylesheet(BASE).print()).toBe(BASE)
  })
})
