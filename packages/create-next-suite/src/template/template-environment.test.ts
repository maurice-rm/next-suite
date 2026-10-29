import { describe, expect, it } from 'vitest'

import { templateEnvironment } from './template-environment.ts'

const VALUES = { project: { name: 'my-app' } }

const renderUnchecked = (source: string): string =>
  templateEnvironment.compile(source, { strict: true })(VALUES)

describe('templateEnvironment', () => {
  it('keeps only if, unless and each', () => {
    expect(Object.keys(templateEnvironment.helpers).sort()).toEqual(['each', 'if', 'unless'])
  })

  it('still renders if, unless and each', () => {
    expect(renderUnchecked('{{#if project}}{{#each project}}{{this}}{{/each}}{{/if}}')).toBe(
      'my-app',
    )
  })

  it.each([
    ['with', '{{#with project}}{{name}}{{/with}}'],
    ['lookup', '{{lookup project "name"}}'],
    ['log', '{{log "hi"}}'],
    ['a section on a value', '{{#project}}{{name}}{{/project}}'],
  ])('fails on %s even without the rule check', (_name, source) => {
    expect(() => renderUnchecked(source)).toThrow()
  })
})
