import { Command } from 'commander'
import { describe, expect, it } from 'vitest'

import { pluginManifestSchema } from '../contract/plugin-manifest.ts'
import { TEST_CATEGORIES, TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { answersFromFlags, createFlags } from './flags.ts'
import { buildQuestions } from './questions.ts'

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
      engine: '^1.0.0',
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
})
