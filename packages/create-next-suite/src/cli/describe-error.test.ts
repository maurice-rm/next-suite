import { describe, expect, it } from 'vitest'

import { InputError } from '../input-error.ts'
import { describeError } from './describe-error.ts'

describe('describeError', () => {
  it('names the command, the message of an expected failure and its cause', () => {
    const error = new InputError('the answer file is invalid', { cause: new Error('line 3') })

    expect(describeError(error, 'next-suite')).toBe(
      'next-suite: the answer file is invalid\n  line 3',
    )
  })

  it('asks to report any other error, with its stack', () => {
    const error = new TypeError('cannot read properties of undefined')

    const message = describeError(error, 'create-next-suite')

    expect(message).toMatch(
      /^create-next-suite: unexpected error, please report it at https:\/\/github\.com\/maurice-rm\/next-suite\/issues\nTypeError: cannot read properties of undefined\n\s+at /,
    )
  })
})
