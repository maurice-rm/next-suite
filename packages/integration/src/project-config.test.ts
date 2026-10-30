import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PROJECT_NAME } from './project-name.ts'
import { runCli } from './run-cli.ts'

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.resolve('create-next-suite/package.json')))
const TSC = fileURLToPath(new URL('bin/tsc', import.meta.resolve('typescript/package.json')))
/** Checks the config and the registry types only, as the project's own tsconfig would. */
const CHECK_CONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  },
  files: ['next-suite.config.ts', '.next-suite/types.d.ts'],
}
const MAIL_PLUGIN = [
  "import { definePlugin } from 'create-next-suite/plugin'",
  '',
  'export default definePlugin({',
  "  name: 'mail',",
  "  title: 'Mail',",
  "  options: { provider: { question: 'Which provider?', choices: ['resend', 'smtp'], default: 'resend' } },",
  '})',
  '',
].join('\n')

const execFileAsync = promisify(execFile)

let workspace: string
let project: string
let config: string

/** Type-checks the project's config against its registry types with TypeScript. */
const typecheck = async (): Promise<string> => {
  try {
    await execFileAsync(process.execPath, [TSC, '-p', 'tsconfig.check.json'], { cwd: project })
    return ''
  } catch (error) {
    return (error as { stdout: string }).stdout
  }
}

const writeConfig = (text: string) => writeFile(join(project, 'next-suite.config.ts'), text)

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'next-suite-project-config-'))
  await mkdir(join(workspace, 'mail'))
  await writeFile(join(workspace, 'mail', 'plugin.ts'), MAIL_PLUGIN)
  const result = await runCli(
    'create-next-suite',
    [PROJECT_NAME, '--yes', '--no-git', '--no-install', '--plugin', './mail', '--mail'],
    { cwd: workspace },
  )
  expect(result.stderr).toBe('')
  project = join(workspace, PROJECT_NAME)
  await mkdir(join(project, 'node_modules'))
  await symlink(PACKAGE_ROOT, join(project, 'node_modules', 'create-next-suite'))
  await writeFile(join(project, 'tsconfig.check.json'), JSON.stringify(CHECK_CONFIG))
  config = await readFile(join(project, 'next-suite.config.ts'), 'utf8')
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('the next-suite.config.ts of a generated project', () => {
  it('type-checks against the registry types create-next-suite writes', async () => {
    expect(config).toContain('    "../mail",\n')
    expect(config).toContain('    mail: { provider: "resend" },\n')
    expect(await typecheck()).toBe('')
  })

  it('suggests the plugin a misspelled name meant', async () => {
    await writeConfig(config.replace('    "eslint",\n', '    "eslnt",\n'))

    expect(await typecheck()).toMatch(
      /next-suite\.config\.ts\(\d+,\d+\): error TS2820: Type '"eslnt"' is not assignable to type 'PluginEntry'\. Did you mean '"eslint"'\?/,
    )
  })

  it('refuses an answer that is none of the choices', async () => {
    await writeConfig(config.replace('mail: { provider: "resend" },', 'mail: { provider: "ses" },'))

    expect(await typecheck()).toMatch(
      /error TS2322: Type '"ses"' is not assignable to type '"resend" \| "smtp"( \| undefined)?'\./,
    )
  })

  it('refuses answers to a plugin without options', async () => {
    await writeConfig(config.replace('mail: { provider: "resend" },', 'knip: { strict: true },'))

    expect(await typecheck()).toMatch(
      /error TS2353: Object literal may only specify known properties, and 'knip' does not exist/,
    )
  })

  it('takes a plugin defined in place with definePlugin', async () => {
    await writeConfig(
      config
        .replace('import { defineSuiteConfig }', 'import { definePlugin, defineSuiteConfig }')
        .replace(
          '  plugins: [\n',
          "  plugins: [\n    definePlugin({ name: 'site-url', title: 'Site URL' }),\n",
        ),
    )

    expect(await typecheck()).toBe('')
  })
})
