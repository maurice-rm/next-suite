import { describe, expect, it } from 'vitest'
import { TEST_PLUGINS, TEST_QUESTIONS } from '../../test-support/questions.ts'
import { GO_BACK } from '../../ui/prompts.ts'
import { findConflicts } from '../find-incompatibilities.ts'
import { type Ask, runWizard, type WizardStep } from './run-wizard.ts'

const SETTINGS = {
  'src-dir': false,
  'import-alias': '@/*',
  'react-compiler': false,
  'cache-components': true,
}

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

const wizard = (ask: Ask, input: Record<string, unknown> = {}, shown: string[][] = []) =>
  runWizard({
    questions: TEST_QUESTIONS,
    input: { ...SETTINGS, ...input },
    ask,
    findProblems: (answers) => findConflicts(TEST_PLUGINS, answers),
    showProblems: (problems) => shown.push(problems),
    directory: 'my-app',
    action: undefined,
    hasExistingFiles: () => false,
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
      action: undefined,
      hasExistingFiles: () => false,
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
    expect(pluginNames(result)).toEqual(['pnpm', 'tailwind'])
  })

  it('keeps answers from the input with the quick start', async () => {
    const { ask } = scripted([true])

    const result = await wizard(ask, { 'package-manager': 'npm', orm: 'drizzle' })

    expect(pluginNames(result)).toEqual(['npm', 'drizzle', 'tailwind'])
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
      action: undefined,
      hasExistingFiles: () => false,
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
    const { ask } = scripted(['pnpm', false, 'prisma', [], false, true, false])

    const result = await wizard(ask, {}, shown)

    expect(shown).toEqual([['better-auth: Not tested with Prisma.']])
    expect(pluginNames(result)).toEqual(['pnpm', 'prisma'])
  })

  it('reports input that the final answers do not use', async () => {
    const { ask } = scripted([false, null, [], false, false])

    const { unused } = await wizard(ask, { 'package-manager': 'pnpm', 'drizzle.casing': 'camel' })

    expect(unused).toEqual(['drizzle.casing'])
  })

  it('fails when incompatible answers came only from the input, also after asking the name', async () => {
    const input = {
      ...SETTINGS,
      'package-manager': 'pnpm',
      orm: 'prisma',
      styling: [],
      seo: false,
      'better-auth': true,
    }

    await expect(wizard(scripted([]).ask, input)).rejects.toThrow(
      'better-auth: Not tested with Prisma.',
    )
    await expect(
      runWizard({
        questions: TEST_QUESTIONS,
        input,
        ask: scripted(['my-app']).ask,
        findProblems: (answers) => findConflicts(TEST_PLUGINS, answers),
        showProblems: () => undefined,
        directory: undefined,
        action: undefined,
        hasExistingFiles: () => false,
      }),
    ).rejects.toThrow('better-auth: Not tested with Prisma.')
  })

  it('asks what to do with a directory that has files, right after the name, and returns it', async () => {
    const { ask, asked } = scripted(['shop', 'overwrite', 'pnpm', true])

    const result = await runWizard({
      questions: TEST_QUESTIONS,
      input: SETTINGS,
      directory: undefined,
      action: undefined,
      hasExistingFiles: (directory) => directory === 'shop',
      ask,
      findProblems: () => [],
      showProblems: () => undefined,
    })

    expect(asked.slice(0, 2)).toEqual(['project-name', 'target-action'])
    expect(result.action).toBe('overwrite')
  })

  it('takes the action from the command line without asking, and create when nothing is in the way', async () => {
    const withFlag = await runWizard({
      questions: TEST_QUESTIONS,
      input: SETTINGS,
      directory: 'shop',
      action: 'empty',
      hasExistingFiles: () => true,
      ask: scripted(['pnpm', true]).ask,
      findProblems: () => [],
      showProblems: () => undefined,
    })
    const free = await wizard(scripted(['pnpm', true]).ask)

    expect(withFlag.action).toBe('empty')
    expect(free.action).toBe('create')
  })
})
