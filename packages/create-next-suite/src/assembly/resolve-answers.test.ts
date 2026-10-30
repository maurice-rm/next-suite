import { describe, expect, it } from 'vitest'

import { definePlugin } from '../plugin-definition/define-plugin.ts'
import { resolveAnswers } from './resolve-answers.ts'

const PINO = definePlugin({
  name: 'pino',
  title: 'pino',
  options: {
    level: {
      question: 'Level?',
      choices: ['debug', { value: 'info', label: 'Info' }],
      default: 'info',
    },
    pretty: { type: 'boolean', question: 'Pretty?', default: false },
    targets: {
      type: 'multiselect',
      question: 'Targets?',
      choices: ['file', 'stdout'],
      default: [],
    },
  },
})

describe('resolveAnswers', () => {
  it('takes the default for each option without an answer', () => {
    expect(resolveAnswers(PINO)).toEqual({ level: 'info', pretty: false, targets: [] })
  })

  it('takes the given answers', () => {
    expect(resolveAnswers(PINO, { level: 'debug', pretty: true, targets: ['file'] })).toEqual({
      level: 'debug',
      pretty: true,
      targets: ['file'],
    })
  })

  it('refuses an option the plugin does not have', () => {
    expect(() => resolveAnswers(PINO, { colour: 'red' })).toThrow('pino has no option colour')
  })

  it('refuses an answer outside the choices and names them', () => {
    expect(() => resolveAnswers(PINO, { level: 'verbose' })).toThrow(
      '"verbose" is no answer to pino\'s level; choose one of debug, info',
    )
    expect(() => resolveAnswers(PINO, { pretty: 'yes' })).toThrow(
      '"yes" is no answer to pino\'s pretty; choose true or false',
    )
    expect(() => resolveAnswers(PINO, { targets: ['file', 'cloud'] })).toThrow(
      '["file","cloud"] is no answer to pino\'s targets; choose any of file, stdout',
    )
  })
})
