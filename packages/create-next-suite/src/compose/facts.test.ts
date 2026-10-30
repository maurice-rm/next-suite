import { describe, expect, it } from 'vitest'

import type { Answers } from '../answers/answers.ts'
import type { LoadedPlugin } from '../loader/load-plugin.ts'
import { askFact, collectFacts } from './facts.ts'

const plugin = (name: string, extra: Partial<LoadedPlugin['manifest']> = {}): LoadedPlugin => ({
  directory: `/plugins/${name}`,
  source: { kind: 'builtin' },
  manifest: {
    name,
    version: '1.0.0',
    contract: '^1.0.0',
    title: name,
    description: name,
    ...extra,
  },
})

const ANSWERS: Answers = {
  plugins: [{ name: 'drizzle', category: 'orm' }],
  settings: {},
  options: {},
}

describe('collectFacts', () => {
  it('knows every available plugin and category, selected or not', () => {
    const facts = collectFacts(
      [
        plugin('drizzle', { category: 'orm' }),
        plugin('prisma', { category: 'orm' }),
        plugin('better-auth', { category: 'auth' }),
      ],
      ANSWERS,
    )

    expect(Object.fromEntries(facts)).toEqual({
      'plugin:drizzle': true,
      'plugin:prisma': false,
      'plugin:better-auth': false,
      'category:orm': true,
      'category:auth': false,
    })
  })

  it('evaluates the facts plugins define', () => {
    const logging = plugin('logging', {
      facts: { 'needs-logger': { any: [{ category: 'api' }, { category: 'orm' }] } },
    })

    expect(collectFacts([logging], ANSWERS).get('fact:needs-logger')).toBe(true)
  })

  it('rejects a fact two plugins define', () => {
    const fact = { facts: { shared: { plugin: 'drizzle' } } }

    expect(() => collectFacts([plugin('one', fact), plugin('two', fact)], ANSWERS)).toThrow(
      'two plugins define the fact "shared"',
    )
  })
})

describe('askFact', () => {
  it('answers a known fact and names the asker of an unknown one', () => {
    const facts = new Map([['plugin:drizzle', true]])

    expect(askFact(facts, 'plugin:drizzle', 'the template')).toBe(true)
    expect(() => askFact(facts, 'plugin:drizle', 'the template')).toThrow(
      'the template asks the unknown fact "plugin:drizle"',
    )
  })
})
