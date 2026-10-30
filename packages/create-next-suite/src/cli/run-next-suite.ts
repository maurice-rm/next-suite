import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Writable } from 'node:stream'

import { Command, CommanderError } from 'commander'

import { checkTemplate, PLUGIN_TEMPLATE_BLOCKS } from '../compose/template/check-template.ts'
import { registryName } from '../contract/identifiers.ts'
import { InputError } from '../input-error.ts'
import type { RemoteEnvironment } from '../loader/fetch-remote-plugin.ts'
import { loadPlugin } from '../loader/load-plugin.ts'
import { parsePluginAddress } from '../loader/plugin-address.ts'
import { fetchRegistry } from '../loader/registry.ts'
import { readUserConfig, type UserConfig, writeUserConfig } from '../trust/user-config.ts'
import { failure } from '../ui/theme.ts'
import { NEXT_SUITE_COMMAND } from './command-name.ts'
import { EXIT_FAILURE, EXIT_SUCCESS } from './exit-code.ts'
import { describeExpectedError } from './report-error.ts'

/** Everything `next-suite` reads from outside: arguments, output, folder, network and config. */
export type NextSuiteEnvironment = {
  argv: readonly string[]
  cliVersion: string
  cwd: string
  output: Writable
  error: Writable
  remote: RemoteEnvironment
  userConfigPath: string
}

const TEMPLATE_EXTENSION = '.hbs'

const updateConfig = async (path: string, change: (config: UserConfig) => void): Promise<void> => {
  const config = await readUserConfig(path)
  change(config)
  await writeUserConfig(path, config)
}

type RegistryToAdd = { name: string; source: string; isTrusted: boolean; isReplacing: boolean }

/** A local registry is kept by its absolute path, so it resolves from any folder later. */
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
  await updateConfig(environment.userConfigPath, (config) => {
    config.registries[name] = storedSource(source, environment.cwd)
    const pattern = `${name}/*`
    if (isTrusted && !config.trust.includes(pattern)) {
      config.trust.push(pattern)
    }
  })
  const trusted = isTrusted ? ', trusted' : ''
  return `Added ${name} with ${registry.index.plugins.length} plugins${trusted}`
}

const listRegistries = async (environment: NextSuiteEnvironment, name: string | undefined) => {
  const { registries } = await readUserConfig(environment.userConfigPath)
  if (name === undefined) {
    const entries = Object.entries(registries)
    return entries.length === 0
      ? 'No registries yet; add one with `next-suite registry add <name> <source>`'
      : entries.map(([registry, source]) => `${registry}  ${source}`).join('\n')
  }
  const source = registries[name]
  if (source === undefined) {
    throw new InputError(`the registry ${name} is unknown`)
  }
  const { index } = await fetchRegistry(source, environment)
  return index.plugins.map((plugin) => `${name}/${plugin.name}  ${plugin.description}`).join('\n')
}

const removeRegistry = async (environment: NextSuiteEnvironment, name: string) => {
  await updateConfig(environment.userConfigPath, (config) => {
    if (config.registries[name] === undefined) {
      throw new InputError(`the registry ${name} is unknown`)
    }
    delete config.registries[name]
    config.trust = config.trust.filter((pattern) => pattern !== `${name}/*`)
  })
  return `Removed ${name}`
}

const changeTrust = async (
  environment: NextSuiteEnvironment,
  pattern: string,
  isAdding: boolean,
): Promise<string> => {
  await updateConfig(environment.userConfigPath, (config) => {
    const index = config.trust.indexOf(pattern)
    if (isAdding && index === -1) {
      config.trust.push(pattern)
    }
    if (!isAdding) {
      if (index === -1) {
        throw new InputError(`${pattern} is not trusted`)
      }
      config.trust.splice(index, 1)
    }
  })
  return isAdding ? `Trusted ${pattern}` : `No longer trusted: ${pattern}`
}

const listTrust = async (environment: NextSuiteEnvironment): Promise<string> => {
  const { trust } = await readUserConfig(environment.userConfigPath)
  return trust.length === 0 ? 'No trusted sources yet' : trust.join('\n')
}

/** Loads a plugin folder like any plugin and checks its templates against the template rules. */
const validatePlugin = async (environment: NextSuiteEnvironment, folder: string) => {
  const plugin = await loadPlugin(resolve(environment.cwd, folder))
  for (const file of plugin.manifest.files ?? []) {
    if (file.source.endsWith(TEMPLATE_EXTENSION)) {
      checkTemplate(
        await readFile(join(plugin.folder, file.source), 'utf8'),
        PLUGIN_TEMPLATE_BLOCKS,
      )
    }
  }
  return `${plugin.manifest.name} ${plugin.manifest.version} is a valid plugin`
}

const createProgram = (environment: NextSuiteEnvironment, report: (text: string) => void) => {
  const program = new Command()
    .name(NEXT_SUITE_COMMAND)
    .description('Manage plugin registries and trust for create-next-suite.')
    .version(environment.cliVersion)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => environment.output.write(text),
      writeErr: (text) => environment.error.write(text),
    })
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
    .action(async (name: string | undefined) => report(await listRegistries(environment, name)))
  registry
    .command('remove <name>')
    .description('remove a registry')
    .action(async (name: string) => report(await removeRegistry(environment, name)))
  const trust = program
    .command('trust')
    .description('Manage the sources whose plugins may run code.')
  trust
    .command('add <pattern>')
    .description('trust a source pattern, such as `github:acme/*` or `@acme/*`')
    .action(async (pattern: string) => report(await changeTrust(environment, pattern, true)))
  trust
    .command('list')
    .description('list the trusted source patterns')
    .action(async () => report(await listTrust(environment)))
  trust
    .command('remove <pattern>')
    .description('stop trusting a source pattern')
    .action(async (pattern: string) => report(await changeTrust(environment, pattern, false)))
  program
    .command('plugin')
    .description('Work on plugins.')
    .command('validate <folder>')
    .description('check that a folder is a valid plugin with valid templates')
    .action(async (folder: string) => report(await validatePlugin(environment, folder)))
  return program
}

/** Runs `next-suite` and answers its exit code; expected failures print one message. */
export const runNextSuite = async (environment: NextSuiteEnvironment): Promise<number> => {
  const program = createProgram(environment, (text) => environment.output.write(`${text}\n`))
  try {
    await program.parseAsync([...environment.argv], { from: 'user' })
    return EXIT_SUCCESS
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode
    }
    environment.error.write(`${failure(describeExpectedError(error, NEXT_SUITE_COMMAND))}\n`)
    return EXIT_FAILURE
  }
}
