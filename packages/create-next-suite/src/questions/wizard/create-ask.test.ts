import { PassThrough } from 'node:stream'
import { stripVTControlCharacters } from 'node:util'

import { describe, expect, it } from 'vitest'

import type { PluginOption } from '../../contract/plugin-option.ts'
import { collectOutput } from '../../test-support/collect-output.ts'
import { KEYS } from '../../test-support/keys.ts'
import { parseTestManifest } from '../../test-support/test-manifest.ts'
import { createAsk } from './create-ask.ts'

const CHOICES = [
  { value: 'snake', label: 'snake_case', description: 'user_id, created_at' },
  { value: 'camel', label: 'camelCase' },
]

const CONTEXT = {
  findDirectoryProblem: () => undefined,
  canEmpty: () => true,
  detectedPackageManager: undefined,
}

const OPTIONS: PluginOption[] = [
  {
    type: 'select',
    question: 'Column casing?',
    choices: CHOICES,
    default: 'snake',
  },
  {
    type: 'multiselect',
    question: 'Column casing?',
    choices: CHOICES,
    default: [],
  },
]

/** Asks an option step, answers it with Enter and returns what the wizard rendered. */
const renderOptionStep = async (option: PluginOption): Promise<string> => {
  const input = new PassThrough()
  const output = collectOutput()
  const ask = createAsk({ input, output: output.stream }, CONTEXT)
  const plugin = parseTestManifest('drizzle', { options: { casing: option } })
  const answer = ask(
    {
      kind: 'option',
      key: 'drizzle.casing',
      section: undefined,
      isEssential: false,
      plugin,
      optionKey: 'casing',
      option,
    },
    {
      canGoBack: false,
      answers: { plugins: [], settings: {}, options: {} },
      previousSection: undefined,
      previousAnswer: undefined,
    },
  )
  input.write(KEYS.enter)
  await answer
  return stripVTControlCharacters(output.text())
}

describe('createAsk', () => {
  it.each(OPTIONS)('shows the description of a $type choice as its hint', async (option) => {
    const rendered = await renderOptionStep(option)

    expect(rendered).toContain('snake_case (user_id, created_at)')
    expect(rendered).toMatch(/camelCase\s*$/m)
  })
})
