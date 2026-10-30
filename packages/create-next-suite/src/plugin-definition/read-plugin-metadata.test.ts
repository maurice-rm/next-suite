import { describe, expect, it } from 'vitest'

import { definePlugin } from './define-plugin.ts'
import { summarizePlugin } from './plugin-metadata.ts'
import { readPluginMetadata } from './read-plugin-metadata.ts'

const plugin = (
  body: string,
  imports = "import { definePlugin } from 'create-next-suite/plugin'",
) => `${imports}\n\nexport default definePlugin({\n${body}\n})\n`

const read = (source: string) => readPluginMetadata('plugin.ts', source)

describe('readPluginMetadata', () => {
  it('reads the metadata and the point names as written, leaving the other fields unread', () => {
    const summary = read(
      plugin(`
  name: 'mail',
  title: \`Mail\`,
  description: 'Sends mail.',
  section: 'Integrations',
  replaces: 'static-csp',
  conflicts: { 'other-mail': 'Only one mailer.' },
  options: {
    provider: {
      question: 'Which provider?',
      choices: ['resend', { value: 'smtp', label: 'SMTP', description: 'Any server' }],
      default: 'smtp',
    },
    preview: { question: 'Preview mails?', type: 'boolean', default: false } satisfies object,
  },
  uses: { logger: optional(logger) },
  provides: { mailer: ({ options }) => options.provider },
  collects: { mailTemplates: { create, finish } },
  extend: { csp: (csp) => csp.allow('connect-src', HOST) },
  dependencies: VERSIONS,
  files: ({ has }) => ({}),`),
    )

    expect(summary).toEqual({
      metadata: {
        name: 'mail',
        title: 'Mail',
        description: 'Sends mail.',
        section: 'Integrations',
        replaces: 'static-csp',
        conflicts: { 'other-mail': 'Only one mailer.' },
        options: {
          provider: {
            question: 'Which provider?',
            choices: ['resend', { value: 'smtp', label: 'SMTP', description: 'Any server' }],
            default: 'smtp',
          },
          preview: {
            question: 'Preview mails?',
            type: 'boolean',
            default: false,
          },
        },
      },
      points: {
        uses: ['logger'],
        provides: ['mailer'],
        collects: ['mailTemplates'],
        extend: ['csp'],
      },
    })
  })

  it('reads what the plugin exports once it runs, leaving absent fields absent', () => {
    const source = plugin(
      "  name: 'mail',\n  title: 'Mail',\n  conflicts: { other: 'No.' },\n  provides: { mailer: () => 'smtp' },",
    )
    const exported = definePlugin({
      name: 'mail',
      title: 'Mail',
      conflicts: { other: 'No.' },
      readme: { Mail: 'Sends mail.' },
    })

    expect(read(source)).toEqual({
      ...summarizePlugin(exported),
      points: { uses: [], provides: ['mailer'], collects: [], extend: [] },
    })
    expect(summarizePlugin(exported).metadata).toEqual({
      name: 'mail',
      title: 'Mail',
      conflicts: { other: 'No.' },
    })
  })

  it('accepts definePlugin under another local name', () => {
    const source = plugin(
      "  name: 'mail',\n  title: 'Mail',",
      "import { definePlugin as define } from 'create-next-suite/plugin'",
    ).replace('definePlugin({', 'define({')

    expect(read(source).metadata).toEqual({ name: 'mail', title: 'Mail' })
  })

  it.each([
    ['a variable', "  name: NAME,\n  title: 'Mail',", 'name is no fixed value (found Identifier)'],
    ['a shorthand', "  name,\n  title: 'Mail',", 'name is no fixed value (found Identifier)'],
    [
      'a template with a value',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the plugin source under test
      "  name: 'mail',\n  title: `Mail ${version}`,",
      'title is no fixed value (found TemplateLiteral)',
    ],
    [
      'a call in an option',
      "  name: 'mail',\n  title: 'Mail',\n  options: { a: { question: ask(), type: 'boolean', default: true } },",
      'options.a.question is no fixed value (found CallExpression)',
    ],
    [
      'a function as metadata',
      "  name: 'mail',\n  title: () => 'Mail',",
      'title is no fixed value (found ArrowFunctionExpression)',
    ],
    ['a spread', "  ...shared,\n  name: 'mail',\n  title: 'Mail',", 'definePlugin spreads'],
    [
      'a computed key',
      "  name: 'mail',\n  title: 'Mail',\n  conflicts: { [OTHER]: 'No.' },",
      'conflicts has a key that is no fixed name',
    ],
    [
      'point names of a variable',
      "  name: 'mail',\n  title: 'Mail',\n  provides: PROVIDED,",
      'provides is no object literal (found Identifier)',
    ],
  ])('fails for metadata written as %s, naming the field', (_kind, body, message) => {
    expect(() => read(plugin(body))).toThrow(message)
  })

  it.each([
    ['no name', "  title: 'Mail',", 'metadata.name'],
    ['a name with spaces', "  name: 'my mail',\n  title: 'Mail',", 'use a lowercase name'],
    [
      'a default outside the choices',
      "  name: 'mail',\n  title: 'Mail',\n  options: { a: { question: 'A?', choices: ['x'], default: 'y' } },",
      'metadata.options.a: the default must be one of the choices',
    ],
    [
      'a misspelled option field',
      "  name: 'mail',\n  title: 'Mail',\n  options: { a: { question: 'A?', type: 'boolean', defualt: true } },",
      'metadata.options.a',
    ],
  ])('fails for invalid metadata: %s', (_kind, body, message) => {
    expect(() => read(plugin(body))).toThrow(message)
  })

  it.each([
    [
      'an escape sequence in the title',
      "  name: 'mail',\n  title: 'Mail\\u001b[8m',",
      'title holds a control character',
    ],
    [
      'a bidi override in a choice',
      "  name: 'mail',\n  title: 'Mail',\n  options: { a: { question: 'A?', choices: ['x\\u202e'], default: 'x\\u202e' } },",
      'options.a.choices[0] holds a control character',
    ],
    [
      'a control character in a point name',
      "  name: 'mail',\n  title: 'Mail',\n  provides: { 'm\\u0007': 1 },",
      'provides has a key that holds a control character',
    ],
    [
      'a newline in a template',
      "  name: 'mail',\n  title: `Mail\nOfficial`,",
      'title holds a control character',
    ],
  ])('fails for metadata with %s, which a terminal would run', (_kind, body, message) => {
    expect(() => read(plugin(body))).toThrow(message)
  })

  it('fails for a file without definePlugin as its default export', () => {
    expect(() => read("export const plugin = { name: 'mail' }\n")).toThrow(
      'it has no export default definePlugin({…})',
    )
    expect(() => read("export default { name: 'mail', title: 'Mail' }\n")).toThrow(
      'its default export is no export default definePlugin({…})',
    )
    expect(() =>
      read(
        "const definePlugin = (x) => x\nexport default definePlugin({ name: 'a', title: 'A' })\n",
      ),
    ).toThrow('its default export is no')
    expect(() => read(plugin('').replace('({\n\n})', '(definition)'))).toThrow(
      'definePlugin is no object literal (found Identifier)',
    )
  })

  it('fails for a file that does not parse', () => {
    expect(() => read('export default definePlugin({')).toThrow('it does not parse')
  })
})
