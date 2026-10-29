import { readFile } from 'node:fs/promises'

import { InputError } from './input-error.ts'
import type { AnswerInput } from './resolve-answers.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads an answer file: a JSON object in the format of `answers` in next-suite.json. */
export const readAnswerFile = async (path: string): Promise<AnswerInput> => {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new InputError(`cannot read the answer file ${path}`, { cause: error })
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new InputError(`the answer file ${path} is not valid JSON`, { cause: error })
  }
  if (!isRecord(json)) {
    throw new InputError(`the answer file ${path} must hold a JSON object`)
  }
  return json
}
