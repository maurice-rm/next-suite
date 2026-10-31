import { describe, expect, it } from 'vitest'

import { InputError } from '../input-error.ts'
import type { PluginOption } from '../plugin-definition/plugin-option.ts'
import { parseOptionAnswers } from './parse-option-answers.ts'

const OPTIONS: Readonly<Record<string, PluginOption>> = {
  provider: {
    question: 'Which provider?',
    choices: ['resend', 'smtp'],
    default: 'resend',
  },
  tracking: { type: 'boolean', question: 'Track opens?', default: false },
  channels: {
    type: 'multiselect',
    question: 'Which channels?',
    choices: ['email', 'sms', 'push'],
    default: ['email'],
  },
}

describe('parseOptionAnswers', () => {
  it('reads each option as --option value, --option=value or a boolean flag', () => {
    expect(
      parseOptionAnswers(['--provider', 'smtp', '--tracking', '--channels=email,sms'], {
        plugin: 'mail',
        options: OPTIONS,
      }),
    ).toEqual({ provider: 'smtp', tracking: true, channels: ['email', 'sms'] })
    expect(
      parseOptionAnswers(['--no-tracking'], {
        plugin: 'mail',
        options: OPTIONS,
      }),
    ).toEqual({
      tracking: false,
    })
  })

  it('refuses an option the plugin does not have, naming those it has', () => {
    expect(() =>
      parseOptionAnswers(['--level', 'debug'], {
        plugin: 'mail',
        options: OPTIONS,
      }),
    ).toThrow(
      new InputError(
        'mail has no option --level; its options are --provider, --tracking, --channels',
      ),
    )
  })

  it('refuses a value that is none of the choices, and an option without a value', () => {
    expect(() =>
      parseOptionAnswers(['--provider', 'ses'], {
        plugin: 'mail',
        options: OPTIONS,
      }),
    ).toThrow('mail --provider takes one of resend, smtp, not "ses"')
    expect(() => parseOptionAnswers(['--provider'], { plugin: 'mail', options: OPTIONS })).toThrow(
      'mail --provider needs a value',
    )
  })

  it('refuses an argument that is no option', () => {
    expect(() => parseOptionAnswers(['smtp'], { plugin: 'mail', options: OPTIONS })).toThrow(
      'expected an option such as --provider, not "smtp"',
    )
  })
})
