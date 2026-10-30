import { describe, expect, it } from 'vitest'

import { openTypescriptModule } from '../code-edit/typescript-module.ts'
import { readFromValidatedEnv } from './validated-env.ts'

const LOGGER = [
  'import pino from "pino";',
  '',
  'const level = process.env.LOG_LEVEL ?? "info";',
  '',
  'export const logger = pino({ level });',
  '',
].join('\n')

const T3_ENV = {
  import: { name: 'env', from: '@/env' },
  reference: (name: string) => `env.${name}`,
}

const readLogger = (validatedEnv: typeof T3_ENV | undefined): string => {
  const module = openTypescriptModule('lib/logger.ts', LOGGER)
  readFromValidatedEnv(module, validatedEnv, { level: 'LOG_LEVEL' })
  return module.print()
}

describe('readFromValidatedEnv', () => {
  it('reads each variable through the provider and imports what it names', () => {
    expect(readLogger(T3_ENV)).toBe(
      [
        'import pino from "pino";',
        '',
        'import { env } from "@/env";',
        '',
        'const level = env.LOG_LEVEL;',
        '',
        'export const logger = pino({ level });',
        '',
      ].join('\n'),
    )
  })

  it('leaves the module as written without a provider', () => {
    expect(readLogger(undefined)).toBe(LOGGER)
  })
})
