import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import * as tar from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { stubRemote } from '../test-support/stub-remote.ts'
import { writeFiles } from '../test-support/write-files.ts'
import { fetchExternalPlugin } from './fetch-external-plugin.ts'
import type { InstallRunner } from './install-plugin-dependencies.ts'
import { loadExternalPlugin } from './load-external-plugin.ts'

const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))
const execFileAsync = promisify(execFile)

let root: string
let commands: string[]

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-install-'))
  commands = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Runs npm for real, offline and with a cache of the test, and records each command. */
const runNpm: InstallRunner = async (command, args, cwd) => {
  commands.push([command, ...args].join(' '))
  try {
    const { stdout, stderr } = await execFileAsync(
      command,
      [...args, '--offline', `--cache=${join(root, 'npm-cache')}`],
      { cwd },
    )
    return { isSuccess: true, output: stdout + stderr }
  } catch (error) {
    return { isSuccess: false, output: error instanceof Error ? error.message : String(error) }
  }
}

/** A package `greet` as a tarball whose install script would leave a mark in the test directory. */
const writeGreetPackage = async (directory: string): Promise<void> => {
  await writeFiles(join(root, 'greet-source', 'package'), {
    'package.json': JSON.stringify({
      name: 'greet',
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      scripts: {
        postinstall: `node -e "require('fs').writeFileSync('${join(root, 'script-ran')}', '')"`,
      },
    }),
    'index.js': "export const greeting = 'Hello from greet'\n",
  })
  await tar.c(
    { gzip: true, file: join(directory, 'greet-1.0.0.tgz'), cwd: join(root, 'greet-source') },
    ['package'],
  )
}

const PLUGIN_TS = [
  "import { definePlugin } from 'create-next-suite/plugin'",
  "import { greeting } from 'greet'",
  "export default definePlugin({ name: 'hello', title: 'Hello', readme: { Hello: greeting } })",
  '',
].join('\n')

/** A devDependency and peer from the registry, which an install must never fetch. */
const REGISTRY_DEV_DEPENDENCIES = { 'create-next-suite': '2.0.0' }

const writePlugin = async ({
  extra = {},
  devDependencies = REGISTRY_DEV_DEPENDENCIES,
  peerDependencies = REGISTRY_DEV_DEPENDENCIES,
}: {
  extra?: Readonly<Record<string, string>>
  devDependencies?: Readonly<Record<string, string>>
  peerDependencies?: Readonly<Record<string, string>>
} = {}): Promise<void> => {
  await writeFiles(join(root, 'hello'), {
    'plugin.ts': PLUGIN_TS,
    'package.json': JSON.stringify({
      name: 'hello',
      dependencies: { greet: 'file:greet-1.0.0.tgz' },
      devDependencies,
      peerDependencies,
    }),
    ...extra,
  })
  await writeGreetPackage(join(root, 'hello'))
}

/** Locks the plugin's dependencies the way its author would, with a devDependency of its own. */
const writeLockedPlugin = async (): Promise<void> => {
  await writePlugin({ devDependencies: { greet2: 'file:greet-1.0.0.tgz' }, peerDependencies: {} })
  const locked = await runNpm(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts'],
    join(root, 'hello'),
  )
  expect(locked.isSuccess, locked.output).toBe(true)
  commands = []
}

const load = async () => {
  const fetched = await fetchExternalPlugin('./hello', {
    cwd: root,
    remote: stubRemote(root),
    registries: {},
  })
  return loadExternalPlugin(fetched, {
    pluginEntry: PLUGIN_ENTRY,
    cacheDir: join(root, 'cache'),
    runCommand: runNpm,
  })
}

const hasScriptRun = (): Promise<boolean> =>
  readFile(join(root, 'script-ran')).then(
    () => true,
    () => false,
  )

describe('the npm dependencies of an external plugin', () => {
  it('are installed into the cache without install scripts, and the plugin imports them', async () => {
    await writePlugin({ extra: { '.npmrc': 'ignore-scripts=false\n' } })

    const loaded = await load()

    expect(loaded.module.plugin.readme).toEqual({ Hello: 'Hello from greet' })
    expect(loaded.module.directory.startsWith(join(root, 'cache', 'installed'))).toBe(true)
    expect(commands).toEqual([
      expect.stringMatching(/^npm install --no-package-lock --ignore-scripts --prefer-offline /),
    ])
    expect(await hasScriptRun()).toBe(false)
    await expect(readFile(join(loaded.module.directory, '.npmrc'))).rejects.toThrow()
  })

  it('are installed once per content and taken from the cache afterwards', async () => {
    await writePlugin()

    await load()
    await load()

    expect(commands).toHaveLength(1)
  })

  it('install from the lockfile the plugin ships, which npm checks against its integrity', async () => {
    await writeLockedPlugin()

    const loaded = await load()

    expect(loaded.module.plugin.readme).toEqual({ Hello: 'Hello from greet' })
    expect(commands).toEqual([expect.stringMatching(/^npm ci --ignore-scripts /)])
    await expect(
      readFile(join(loaded.module.directory, 'node_modules/greet2/package.json')),
    ).rejects.toThrow()
  })

  it('fail with npm’s output when the lockfile does not match the package', async () => {
    await writeLockedPlugin()
    await rm(join(root, 'npm-cache'), { recursive: true, force: true })
    await writeFile(join(root, 'hello', 'greet-1.0.0.tgz'), 'not the package that was locked')

    await expect(load()).rejects.toThrow(
      /cannot load the plugin \.\/hello: installing the dependencies of its package.json with npm failed:[\s\S]*EINTEGRITY/,
    )
  })

  it('are not installed for a plugin without dependencies', async () => {
    await writeFiles(join(root, 'hello'), {
      'plugin.ts': PLUGIN_TS.replace("import { greeting } from 'greet'", "const greeting = 'Hi'"),
      'package.json': JSON.stringify({ name: 'hello', devDependencies: { typescript: '7.0.2' } }),
    })

    const loaded = await load()

    expect(commands).toEqual([])
    expect(loaded.module.directory.startsWith(join(root, 'cache', 'snapshot'))).toBe(true)
  })
})
