import type { Command } from 'commander'

import { addTrustedPattern, removeTrustedPattern } from '../user-config/trust-list.ts'
import { readUserConfig } from '../user-config/user-config.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

const trustPattern = async (environment: NextSuiteEnvironment, pattern: string) => {
  await addTrustedPattern(environment.userConfigPath, pattern)
  return `Trusted ${pattern}`
}

const distrustPattern = async (environment: NextSuiteEnvironment, pattern: string) => {
  await removeTrustedPattern(environment.userConfigPath, pattern)
  return `No longer trusted: ${pattern}`
}

const listTrust = async (environment: NextSuiteEnvironment): Promise<string> => {
  const { trust } = await readUserConfig(environment.userConfigPath)
  return trust.length === 0 ? 'No trusted sources yet' : trust.join('\n')
}

export const addTrustCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  const trust = program
    .command('trust')
    .description('Manage the sources whose plugins may run code.')
  trust
    .command('add <pattern>')
    .description('trust a source pattern, such as `github:acme/*` or `@acme/*`')
    .action(async (pattern: string) => report(await trustPattern(environment, pattern)))
  trust
    .command('list')
    .description('list the trusted source patterns')
    .action(async () => report(await listTrust(environment)))
  trust
    .command('remove <pattern>')
    .description('stop trusting a source pattern')
    .action(async (pattern: string) => report(await distrustPattern(environment, pattern)))
}
