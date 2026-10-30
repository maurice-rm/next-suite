import { Command } from 'commander'
import { describe, expect, it } from 'vitest'

import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { TEST_CATEGORIES, TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { buildQuestions } from './build-questions.ts'
import { answersFromFlags, createFlags } from './flags.ts'

const parse = (args: string[]) => {
  const flags = createFlags(TEST_QUESTIONS, new Set(['yes', 'help']))
  const program = new Command().exitOverride().configureOutput({ writeErr: () => undefined })
  for (const option of flags.flatMap((flag) => flag.options)) {
    program.addOption(option)
  }
  program.parse(args, { from: 'user' })
  return answersFromFlags(flags, program.opts())
}

describe('createFlags', () => {
  it('turns flags into answers keyed like answer files', () => {
    expect(
      parse([
        '--package-manager',
        'npm',
        '--orm',
        'drizzle',
        '--drizzle-casing',
        'camel',
        '--styling',
        'tailwind,sass',
        '--no-seo',
        '--src-dir',
        '--import-alias',
        '~/*',
      ]),
    ).toEqual({
      'package-manager': 'npm',
      orm: 'drizzle',
      'drizzle.casing': 'camel',
      styling: ['tailwind', 'sass'],
      seo: false,
      'src-dir': true,
      'import-alias': '~/*',
    })
  })

  it('selects no plugin with --no-<category>', () => {
    expect(parse(['--no-orm', '--no-styling'])).toEqual({ orm: null, styling: [] })
  })

  it('leaves out questions without a flag', () => {
    expect(parse([])).toEqual({})
  })

  it('rejects a plugin that is not in the category', () => {
    expect(() => parse(['--orm', 'kysely'])).toThrow('Allowed choices are drizzle, prisma')
  })

  it('rejects two questions with the same flag', () => {
    const clash = pluginManifestSchema.parse({
      name: 'drizzle-casing',
      version: '1.0.0',
      contract: '^1.0.0',
      title: 'x',
      description: 'x',
    })
    const questions = buildQuestions({
      categories: TEST_CATEGORIES,
      plugins: [...TEST_PLUGINS, clash],
      settings: [],
      runSettings: [],
    })

    expect(() => createFlags(questions, new Set())).toThrow(
      'the flag --drizzle-casing of "drizzle-casing" is already taken by "drizzle.casing"',
    )
  })

  it('groups the flags by section in the help, each with a statement of what it sets', () => {
    const program = new Command().name('create').configureHelp({ helpWidth: 200 })
    for (const option of createFlags(TEST_QUESTIONS, new Set()).flatMap((flag) => flag.options)) {
      program.addOption(option)
    }

    const help = program
      .helpInformation()
      .split('\n')
      .map((line) => line.replace(/\s{2,}/g, '  ').trim())

    expect(help).toEqual([
      'Usage: create [options]',
      '',
      'Project:',
      '--package-manager <plugin>  plugin of the category package-manager (choices: "pnpm", "npm")',
      '--src-dir  put the code inside a src/ directory',
      '--no-src-dir  turn off --src-dir',
      '--import-alias <value>  the import alias, such as @/*',
      '--react-compiler  use the React Compiler',
      '--no-react-compiler  turn off --react-compiler',
      '--cache-components  turn on Cache Components',
      '--no-cache-components  turn off --cache-components',
      '',
      'Data & API:',
      '--orm <plugin>  plugin of the category orm (choices: "drizzle", "prisma")',
      '--no-orm  turn off --orm',
      '--drizzle-casing <value>  the casing option of drizzle (choices: "snake", "camel")',
      '',
      'UI:',
      '--styling <plugins>  plugins of the category styling, comma-separated (choices: "tailwind", "sass")',
      '--no-styling  turn off --styling',
      '',
      'Integrations:',
      '--seo  add seo',
      '--no-seo  turn off --seo',
      '--seo-og-image  turn on the og-image option of seo',
      '--no-seo-og-image  turn off --seo-og-image',
      '--seo-og-title <value>  the og-title option of seo',
      '',
      'Extras:',
      '--better-auth  add better-auth',
      '--no-better-auth  turn off --better-auth',
      '',
      'Options:',
      '-h, --help  display help for command',
      '',
    ])
  })
})
