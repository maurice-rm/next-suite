import { describe, expect, it } from 'vitest'

import type { AnswerInput } from '../answers/answers.ts'
import { InputError } from '../input-error.ts'
import { TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { type AnswerSources, collectAnswers } from './collect-answers.ts'

const ALL_ANSWERS = {
  'package-manager': 'pnpm',
  orm: null,
  styling: ['tailwind'],
  seo: false,
  'better-auth': false,
}

const collect = (sources: Partial<AnswerSources>) =>
  collectAnswers({
    directory: 'shop',
    action: undefined,
    hasExistingFiles: () => false,
    questions: TEST_QUESTIONS,
    plugins: TEST_PLUGINS,
    input: ALL_ANSWERS,
    flagKeys: new Set(),
    mode: { kind: 'input', useDefaults: false },
    ...sources,
  })

describe('collectAnswers from the input', () => {
  it('takes the answers, the settings at their defaults and create for a free directory', async () => {
    const result = await collect({})

    expect(result.directory).toBe('shop')
    expect(result.action).toBe('create')
    expect(result.answers.settings).toMatchObject({ 'src-dir': false, 'import-alias': '@/*' })
  })

  it('requires a project directory, naming --yes when it is set', async () => {
    await expect(collect({ directory: undefined })).rejects.toThrow(
      new InputError(
        'a project name is required without a terminal — pass it as the argument, such as `create-next-suite my-app`',
      ),
    )
    await expect(
      collect({ directory: undefined, mode: { kind: 'input', useDefaults: true } }),
    ).rejects.toThrow(
      new InputError('a project name is required in --yes mode — pass it as the argument'),
    )
  })

  it('refuses a directory with files unless the flags say what to do with them', async () => {
    const hasExistingFiles = () => true

    await expect(collect({ hasExistingFiles })).rejects.toThrow(
      new InputError('"shop" is not empty — pass --overwrite or --empty to proceed'),
    )
    await expect(collect({ hasExistingFiles, action: 'empty' })).resolves.toMatchObject({
      action: 'empty',
    })
  })

  it('lists every missing answer', async () => {
    await expect(collect({ input: { 'package-manager': 'pnpm' } })).rejects.toThrow(
      'answers are missing; pass them as flags or in --answers, or use --yes:\n  orm\n  styling\n  seo\n  better-auth',
    )
  })

  it('rejects input no question uses, and a flag whose question is not asked', async () => {
    const withUnknown: AnswerInput = { ...ALL_ANSWERS, cms: 'sanity' }

    await expect(collect({ input: withUnknown })).rejects.toThrow(
      'these answers belong to no question that is asked: cms',
    )
    await expect(
      collect({
        input: { ...ALL_ANSWERS, 'drizzle.casing': 'camel' },
        flagKeys: new Set(['drizzle.casing']),
      }),
    ).rejects.toThrow('these answers belong to no question that is asked: drizzle.casing')
  })

  it('drops a file answer whose question is not asked after another choice', async () => {
    const result = await collect({ input: { ...ALL_ANSWERS, 'drizzle.casing': 'camel' } })

    expect(result.answers.options).not.toHaveProperty(['drizzle.casing'])
  })

  it('rejects plugins that do not fit together, with the reasons', async () => {
    await expect(
      collect({ input: { ...ALL_ANSWERS, orm: 'prisma', 'better-auth': true } }),
    ).rejects.toThrow('the answers do not fit together:\nbetter-auth: Not tested with Prisma.')
  })
})
