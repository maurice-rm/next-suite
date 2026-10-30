import { resolve } from 'node:path'

import type { Command } from 'commander'

import { registryName } from '../contract/identifiers.ts'
import { InputError } from '../input-error.ts'
import { parsePluginAddress } from '../loader/plugin-address.ts'
import { fetchRegistry } from '../loader/registry.ts'
import { removeRegistry, saveRegistry } from '../user-config/registries.ts'
import { readUserConfig } from '../user-config/user-config.ts'
import type { NextSuiteEnvironment, Report } from './next-suite-environment.ts'

type RegistryToAdd = { name: string; source: string; isTrusted: boolean; isReplacing: boolean }

/** A local registry is kept by its absolute path, so it resolves from any directory later. */
const storedSource = (source: string, cwd: string): string =>
  parsePluginAddress(source)?.kind === 'local' ? resolve(cwd, source) : source

const addRegistry = async (
  environment: NextSuiteEnvironment,
  { name, source, isTrusted, isReplacing }: RegistryToAdd,
): Promise<string> => {
  if (!registryName.safeParse(name).success) {
    throw new InputError(`"${name}" is no registry name; use a scoped name such as @acme`)
  }
  const { registries } = await readUserConfig(environment.userConfigPath)
  if (registries[name] !== undefined && !isReplacing) {
    throw new InputError(
      `the registry ${name} exists already; pass --replace to point it elsewhere`,
    )
  }
  const registry = await fetchRegistry(source, environment)
  if (registry.index.name !== name) {
    throw new InputError(`${source} is the registry ${registry.index.name}, not ${name}`)
  }
  await saveRegistry(environment.userConfigPath, {
    name,
    source: storedSource(source, environment.cwd),
    isTrusted,
  })
  const trusted = isTrusted ? ', trusted' : ''
  return `Added ${name} with ${registry.index.plugins.length} plugins${trusted}`
}

const listRegistries = async (environment: NextSuiteEnvironment): Promise<string> => {
  const entries = Object.entries((await readUserConfig(environment.userConfigPath)).registries)
  return entries.length === 0
    ? 'No registries yet; add one with `next-suite registry add <name> <source>`'
    : entries.map(([registry, source]) => `${registry}  ${source}`).join('\n')
}

const listRegistryPlugins = async (
  environment: NextSuiteEnvironment,
  name: string,
): Promise<string> => {
  const source = (await readUserConfig(environment.userConfigPath)).registries[name]
  if (source === undefined) {
    throw new InputError(`the registry ${name} is unknown`)
  }
  const { index } = await fetchRegistry(source, environment)
  return index.plugins.map((plugin) => `${name}/${plugin.name}  ${plugin.description}`).join('\n')
}

const forgetRegistry = async (environment: NextSuiteEnvironment, name: string): Promise<string> => {
  await removeRegistry(environment.userConfigPath, name)
  return `Removed ${name}`
}

/** Adds `next-suite registry` with its subcommands add, list and remove. */
export const addRegistryCommand = (
  program: Command,
  environment: NextSuiteEnvironment,
  report: Report,
): void => {
  const registry = program.command('registry').description('Manage plugin registries.')
  registry
    .command('add <name> <source>')
    .description('add a registry, such as `@acme github:acme/next-suite-plugins`')
    .option('--trust', 'also trust every plugin of the registry')
    .option('--replace', 'point an existing registry name to the new source')
    .action(async (name: string, source: string, options: { trust?: boolean; replace?: boolean }) =>
      report(
        await addRegistry(environment, {
          name,
          source,
          isTrusted: options.trust === true,
          isReplacing: options.replace === true,
        }),
      ),
    )
  registry
    .command('list [name]')
    .description('list the registries, or the plugins of one')
    .action(async (name: string | undefined) =>
      report(
        name === undefined
          ? await listRegistries(environment)
          : await listRegistryPlugins(environment, name),
      ),
    )
  registry
    .command('remove <name>')
    .description('remove a registry')
    .action(async (name: string) => report(await forgetRegistry(environment, name)))
}
