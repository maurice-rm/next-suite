import { describe, expect, it } from 'vitest'

import { findIncompatibilities } from '../input/find-incompatibilities.ts'
import { TEST_PLUGINS, TEST_QUESTIONS } from '../test-support/questions.ts'
import { GO_BACK } from './prompts.ts'
import { type Ask, runWizard, type WizardStep } from './run-wizard.ts'

/** Plays back replies in order and records which steps were asked. */
const scripted = (replies: unknown[]) => {
  const asked: string[] = []
  const ask: Ask = async (step: WizardStep) => {
    asked.push(step.key)
    if (replies.length === 0) {
      throw new Error(`no reply left for ${step.key}`)
    }
    return replies.shift()
  }
  return { ask, asked }
}

const SETTINGS = {
  'src-dir': false,
  'import-alias': '@/*',
  'react-compiler': false,
  'cache-components': true,
}

const wizard = (ask: Ask, input: Record<string, unknown> = {}, shown: string[][] = []) =>
  runWizard({
    questions: TEST_QUESTIONS,
    input: { ...SETTINGS, ...input },
    ask,
    findProblems: (answers) => findIncompatibilities(TEST_PLUGINS, answers),
    showProblems: (problems) => shown.push(problems),
    directory: 'my-app',
  })

const pluginNames = (result: Awaited<ReturnType<typeof wizard>>): string[] =>
  result.answers.plugins.map((plugin) => plugin.name)

describe('runWizard', () => {
  it('asks the questions that need one plugin, then offers the quick start, then the rest the input leaves open', async () => {
    const { ask, asked } = scripted(['npm', false, null, ['tailwind'], false, false])

    const result = await wizard(ask)

    expect(asked).toEqual([
      'package-manager',
      'quick-start',
      'orm',
      'styling',
      'seo',
      'better-auth',
    ])
    expect(pluginNames(result)).toEqual(['npm', 'tailwind'])
  })

  it('asks the project name first when the command line gave none, and goes back to it', async () => {
    const { ask, asked } = scripted(['first', GO_BACK, 'second', 'pnpm', true])

    const result = await runWizard({
      questions: TEST_QUESTIONS,
      input: SETTINGS,
      ask,
      findProblems: () => [],
      showProblems: () => undefined,
      directory: undefined,
    })

    expect(asked).toEqual([
      'project-name',
      'package-manager',
      'project-name',
      'package-manager',
      'quick-start',
    ])
    expect(result.directory).toBe('second')
  })

  it('takes the default for every remaining question with the quick start', async () => {
    const { ask, asked } = scripted(['pnpm', true])

    const result = await wizard(ask)

    expect(asked).toEqual(['package-manager', 'quick-start'])
    expect(pluginNames(result)).toEqual(['pnpm', 'tailwind', 'seo'])
  })

  it('keeps answers from the input with the quick start', async () => {
    const { ask } = scripted([true])

    const result = await wizard(ask, { 'package-manager': 'npm', orm: 'drizzle' })

    expect(pluginNames(result)).toEqual(['npm', 'drizzle', 'tailwind', 'seo'])
  })

  it('goes back one question and asks it again', async () => {
    const { ask, asked } = scripted(['pnpm', false, 'prisma', GO_BACK, null, [], false, false])

    const result = await wizard(ask)

    expect(asked).toEqual([
      'package-manager',
      'quick-start',
      'orm',
      'styling',
      'orm',
      'styling',
      'seo',
      'better-auth',
    ])
    expect(pluginNames(result)).toEqual(['pnpm'])
  })

  it('goes back over the quick start', async () => {
    const { ask, asked } = scripted(['pnpm', GO_BACK, 'npm', true])

    const result = await wizard(ask)

    expect(asked).toEqual(['package-manager', 'quick-start', 'package-manager', 'quick-start'])
    expect(pluginNames(result)[0]).toBe('npm')
  })

  it('tells each step the section of the step shown before it, also after going back', async () => {
    const sections: (string | undefined)[] = []
    const replies: unknown[] = ['my-app', 'pnpm', false, GO_BACK, false, null, [], false, false]
    const ask: Ask = async (_step, { previousSection }) => {
      sections.push(previousSection)
      return replies.shift()
    }

    await runWizard({
      questions: TEST_QUESTIONS,
      input: SETTINGS,
      ask,
      findProblems: () => [],
      showProblems: () => undefined,
      directory: undefined,
    })

    expect(sections).toEqual([
      undefined,
      'Project',
      'Project',
      'Project',
      'Project',
      'Project',
      'Data & API',
      'UI',
      'Integrations',
    ])
  })

  it('drops the options of a plugin that is no longer selected', async () => {
    const { ask, asked } = scripted([
      'pnpm',
      false,
      'drizzle',
      'camel',
      GO_BACK,
      GO_BACK,
      null,
      [],
      false,
      false,
    ])

    const result = await wizard(ask)

    expect(asked).toEqual([
      'package-manager',
      'quick-start',
      'orm',
      'drizzle.casing',
      'styling',
      'drizzle.casing',
      'orm',
      'styling',
      'seo',
      'better-auth',
    ])
    expect(result.answers.options).toEqual({})
  })

  it('shows incompatible answers and goes back to the last question', async () => {
    const shown: string[][] = []
    const { ask } = scripted(['pnpm', false, null, [], false, true, false])

    const result = await wizard(ask, {}, shown)

    expect(shown).toEqual([['better-auth: Stores sessions in the database.']])
    expect(pluginNames(result)).toEqual(['pnpm'])
  })

  it('reports input that the final answers do not use', async () => {
    const { ask } = scripted([false, null, [], false, false])

    const { unused } = await wizard(ask, { 'package-manager': 'pnpm', 'drizzle.casing': 'camel' })

    expect(unused).toEqual(['drizzle.casing'])
  })

  it('fails when incompatible answers came only from the input', async () => {
    const { ask } = scripted([])

    await expect(
      wizard(ask, {
        'package-manager': 'pnpm',
        orm: null,
        styling: [],
        seo: false,
        'better-auth': true,
      }),
    ).rejects.toThrow('better-auth: Stores sessions in the database.')
  })
})
