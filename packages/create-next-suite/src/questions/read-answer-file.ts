import { readFile } from 'node:fs/promises'

import * as z from 'zod'

import { parseJsonWith } from '../file-system/read-json-file.ts'
import { InputError } from '../input-error.ts'
import type { AnswerInput } from './resolve-answers.ts'

const answerFileSchema = z.record(z.string(), z.unknown(), { error: 'must hold a JSON object' })

/** Reads an answer file: a JSON object in the format of `answers` in next-suite.json. */
export const readAnswerFile = async (path: string): Promise<AnswerInput> => {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    throw new InputError(`cannot read the answer file ${path}`, { cause: error })
  }
  return parseJsonWith(
    text,
    answerFileSchema,
    (problem, options) => new InputError(`the answer file ${path} ${problem}`, options),
  )
}
