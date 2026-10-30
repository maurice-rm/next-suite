import { PassThrough, Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'
import { PromptCancelledError } from './prompt-cancelled-error.ts'
import { confirm, GO_BACK, multiselect, select, text } from './prompts.ts'

const DOWN = '\u001b[B'
const ENTER = '\r'
const ESCAPE = '\u001b'
const CTRL_C = '\u0003'
const KEY_DELAY_MS = 20

const CHOICES = [
  { value: 'drizzle', label: 'Drizzle' },
  { value: 'prisma', label: 'Prisma' },
]

const streams = () => {
  const input = new PassThrough()
  const output = new Writable({ write: (_chunk, _encoding, done) => done() })
  return { input, output }
}

const press = async (input: PassThrough, keys: string[]): Promise<void> => {
  for (const key of keys) {
    await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS))
    input.write(key)
  }
}

describe('prompts', () => {
  it('selects the choice under the cursor', async () => {
    const io = streams()
    const answer = select({
      ...io,
      message: 'ORM?',
      canGoBack: true,
      choices: CHOICES,
      initialValue: 'drizzle',
    })
    await press(io.input, [DOWN, ENTER])

    expect(await answer).toBe('prisma')
  })

  it('goes back with b', async () => {
    const io = streams()
    const answer = select({
      ...io,
      message: 'ORM?',
      canGoBack: true,
      choices: CHOICES,
      initialValue: 'drizzle',
    })
    await press(io.input, ['b'])

    expect(await answer).toBe(GO_BACK)
  })

  it('goes back with Esc', async () => {
    const io = streams()
    const answer = confirm({ ...io, message: 'SEO?', canGoBack: true, initialValue: true })
    await press(io.input, [ESCAPE])

    expect(await answer).toBe(GO_BACK)
  })

  it('cancels with Esc on a question without a way back', async () => {
    const io = streams()
    const answer = text({ ...io, message: 'Name?', canGoBack: false, defaultValue: 'my-app' })
    await press(io.input, ['x', ESCAPE])

    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError)
  })

  it('cancels the wizard with Ctrl+C', async () => {
    const io = streams()
    const answer = confirm({ ...io, message: 'SEO?', canGoBack: true, initialValue: true })
    await press(io.input, [CTRL_C])

    await expect(answer).rejects.toBeInstanceOf(PromptCancelledError)
  })

  it('toggles choices of a multiselect with space', async () => {
    const io = streams()
    const answer = multiselect({
      ...io,
      message: 'Styling?',
      canGoBack: false,
      choices: CHOICES,
      initialValues: ['drizzle'],
    })
    await press(io.input, [DOWN, ' ', ENTER])

    expect(await answer).toEqual(['drizzle', 'prisma'])
  })

  it('lets b be typed in a text prompt and takes the default for an empty answer', async () => {
    const typed = streams()
    const answer = text({ ...typed, message: 'Name?', canGoBack: true, defaultValue: 'my-app' })
    await press(typed.input, ['b', 'o', 'b', ENTER])
    expect(await answer).toBe('bob')

    const empty = streams()
    const defaulted = text({ ...empty, message: 'Name?', canGoBack: true, defaultValue: 'my-app' })
    await press(empty.input, [ENTER])
    expect(await defaulted).toBe('my-app')
  })
})
