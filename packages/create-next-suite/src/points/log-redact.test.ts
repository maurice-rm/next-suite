import { describe, expect, it } from 'vitest'

import { createLogRedact } from './log-redact.ts'

describe('createLogRedact', () => {
  it('keeps the paths in the order they were first given', () => {
    const redact = createLogRedact()
    redact.redact('req.body.password', 'req.headers.cookie')
    redact.redact('req.body.password')

    expect(redact.paths()).toEqual(['req.body.password', 'req.headers.cookie'])
  })
})
