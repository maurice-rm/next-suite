import Handlebars from 'handlebars'
import { describe, expect, it } from 'vitest'

import { BASE_TEMPLATE_BLOCKS, PLUGIN_TEMPLATE_BLOCKS } from './check-template.ts'
import { renderTemplate } from './render-template.ts'

const FACTS = new Map([
  ['plugin:drizzle', true],
  ['plugin:prisma', false],
])

const VALUES = {
  project: { name: 'my-app' },
  options: { sender: 'noreply@example.com' },
  items: ['a', 'b'],
}

const render = (source: string, allowedBlocks = PLUGIN_TEMPLATE_BLOCKS): string =>
  renderTemplate({ source, values: VALUES, facts: FACTS, allowedBlocks })

describe('renderTemplate', () => {
  it('fills in values without escaping them', () => {
    expect(render('<a href="/{{project.name}}">{{options.sender}}</a>')).toBe(
      '<a href="/my-app">noreply@example.com</a>',
    )
  })

  it('branches on a named fact with if, unless and else', () => {
    const source =
      '{{#if (has "plugin:drizzle")}}drizzle{{else}}other{{/if}}|{{#unless (has "plugin:prisma")}}no prisma{{/unless}}'

    expect(render(source)).toBe('drizzle|no prisma')
  })

  it('iterates with each', () => {
    expect(render('{{#each items}}[{{this}}]{{/each}}')).toBe('[a][b]')
  })

  it('rejects a condition on the raw configuration', () => {
    expect(() => render('{{#if options.sender}}x{{/if}}')).toThrow('asks a named fact only')
  })

  it('rejects a fact query combined with other expressions', () => {
    expect(() => render('{{#if (has "plugin:drizzle" "plugin:prisma")}}x{{/if}}')).toThrow(
      'asks a named fact only',
    )
  })

  it('rejects an unknown fact', () => {
    expect(() => render('{{#if (has "plugin:drizle")}}x{{/if}}')).toThrow(
      'unknown fact "plugin:drizle"',
    )
  })

  it('rejects a missing value', () => {
    expect(() => render('{{project.title}}')).toThrow('failed to render')
  })

  it.each([
    ['with', '{{#with project}}{{name}}{{/with}}'],
    ['lookup', '{{lookup project "name"}}'],
    ['log', '{{log "hi"}}'],
    ['a custom helper', '{{upper project.name}}'],
    ['a section on a value', '{{#project}}{{name}}{{/project}}'],
    ['a partial', '{{> footer}}'],
    ['a decorator', '{{* inline}}'],
    ['has as a value', '{{has}}'],
    [
      'a block parameter that shadows has',
      '{{#each items as |has|}}{{#if (has "x")}}T{{/if}}{{/each}}',
    ],
    ['block parameters', '{{#each items as |item|}}{{item}}{{/each}}'],
    ['an else on each', '{{#each items}}x{{else}}empty{{/each}}'],
  ])('rejects %s', (_name, source) => {
    expect(() => render(source)).toThrow(/create-next-suite: .*\(line 1, column \d+\)/)
  })

  it('rejects any condition in a file of the base project, and allows each', () => {
    expect(() => render('{{#if (has "plugin:drizzle")}}x{{/if}}', BASE_TEMPLATE_BLOCKS)).toThrow(
      'the block {{#if}} is not allowed here',
    )
    expect(render('{{#each items}}{{this}}{{/each}}', BASE_TEMPLATE_BLOCKS)).toBe('ab')
  })

  it('names the line of a rule violation', () => {
    expect(() => render('ok\n{{lookup project "name"}}')).toThrow('(line 2, column 1)')
  })

  it('leaves the global Handlebars environment untouched', () => {
    render('{{project.name}}')

    expect(Object.keys(Handlebars.helpers)).toEqual(
      expect.arrayContaining(['with', 'lookup', 'log', 'helperMissing', 'blockHelperMissing']),
    )
  })
})
