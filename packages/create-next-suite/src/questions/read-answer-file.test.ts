import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InputError } from '../input-error.ts'
import { readAnswerFile } from './read-answer-file.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-answers-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const writeAnswerFile = async (content: string): Promise<string> => {
  const path = join(root, 'answers.json')
  await writeFile(path, content)
  return path
}

describe('readAnswerFile', () => {
  it('reads the answers of a JSON object', async () => {
    const path = await writeAnswerFile('{ "orm": "drizzle", "styling": ["tailwind"] }')

    await expect(readAnswerFile(path)).resolves.toEqual({ orm: 'drizzle', styling: ['tailwind'] })
  })

  it('fails with an input error when the file cannot be read', async () => {
    const path = join(root, 'missing.json')

    const error = readAnswerFile(path)

    await expect(error).rejects.toBeInstanceOf(InputError)
    await expect(error).rejects.toThrow(`cannot read the answer file ${path}`)
  })

  it('fails when the file is not valid JSON', async () => {
    const path = await writeAnswerFile('{ orm: drizzle }')

    await expect(readAnswerFile(path)).rejects.toThrow(`the answer file ${path} is not valid JSON`)
  })

  it('fails when the file holds no JSON object', async () => {
    const path = await writeAnswerFile('["drizzle"]')

    const error = readAnswerFile(path)

    await expect(error).rejects.toBeInstanceOf(InputError)
    await expect(error).rejects.toThrow('must hold a JSON object')
  })
})
