import { readFile, rm } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { KEYS } from '../test-support/keys.ts'
import { readJson } from '../test-support/read-json.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { COMMIT_SHA } from '../test-support/stub-remote.ts'

const { run, pathOf, write, githubRoutes } = setUpCreateRuns()

/** A plugin.ts with the given fields, written inside `definePlugin({…})`, after `before`. */
const pluginTs = (fields: string, before = ''): string =>
  [
    "import { definePlugin } from 'create-next-suite/plugin'",
    before,
    `export default definePlugin({\n${fields}\n})`,
    '',
  ].join('\n')

const HELLO_ADDRESS = 'github:acme/plugins/hello'

/** A plugin that writes a file, and leaves a mark in the test directory when its code runs. */
const helloFiles = (): Record<string, string> => ({
  'plugin.ts': pluginTs(
    "  name: 'hello',\n  title: 'Hello',\n  files: { 'hello.txt': 'files/hello.txt' },",
    `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(pathOf('ran.txt'))}, 'ran')`,
  ),
  'files/hello.txt': 'hi\n',
})

const hasRun = async (): Promise<boolean> =>
  readFile(pathOf('ran.txt'), 'utf8').then(
    () => true,
    () => false,
  )

describe('runCreate with external plugins', () => {
  it('adds a plugin from a local directory, with its flag, its files and its source', async () => {
    await write({
      'mail/plugin.ts': pluginTs(
        [
          "  name: 'mail',",
          "  title: 'Mail',",
          "  section: 'Integrations',",
          "  options: { provider: { question: 'Which provider?', choices: ['resend', 'smtp'], default: 'resend' } },",
          "  files: ({ options }) => ({ '@/lib/mail.ts': 'files/' + options.provider + '.ts' }),",
        ].join('\n'),
      ),
      'mail/files/resend.ts': 'export const provider = "resend"\n',
      'mail/files/smtp.ts': 'export const provider = "smtp"\n',
    })

    const help = await run(['--plugin', './mail', '--help'])
    const result = await run([
      'my-app',
      '--yes',
      '--plugin',
      './mail',
      '--mail',
      '--mail-provider',
      'smtp',
      '--no-git',
      '--no-install',
    ])
    const lock = await readJson(pathOf('my-app/.next-suite/lock.json'))
    const config = await readFile(pathOf('my-app/next-suite.config.ts'), 'utf8')

    expect(help.output).toContain('--mail-provider')
    expect(result.exitCode).toBe(0)
    expect(await readFile(pathOf('my-app/lib/mail.ts'), 'utf8')).toBe(
      'export const provider = "smtp"\n',
    )
    expect(lock.plugins).toContainEqual({
      name: 'mail',
      source: '../mail',
      contentHash: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
    })
    expect(lock.answers).toMatchObject({ mail: { provider: 'smtp' } })
    expect(config).toContain('    "../mail",\n')
    expect(config).toContain('    mail: { provider: "smtp" },\n')
  })

  it('rejects an external plugin with the name of a built-in one, and an unknown address', async () => {
    await write({ 'npm/plugin.ts': pluginTs("  name: 'npm',\n  title: 'Not npm',") })

    expect((await run(['my-app', '--yes', '--plugin', './npm'])).error).toContain(
      'two plugins are named npm',
    )
    expect((await run(['my-app', '--yes', '--plugin', 'mail'])).error).toContain(
      'the address has no known form',
    )
  })

  it('stops for a selected external plugin whose precondition fails, with its reason', async () => {
    await write({
      'deploy/plugin.ts': pluginTs(
        "  name: 'deploy',\n  title: 'Deploy',\n  precondition: ({ has }) => has('mailer') || 'it needs a mailer',",
      ),
    })

    const result = await run(['my-app', '--yes', '--dry-run', '--plugin', './deploy', '--deploy'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('the answers do not fit together:\nDeploy: it needs a mailer')
  })

  it('shows the questions of an untrusted plugin without running any of its code', async () => {
    const routes = await githubRoutes('hello', helloFiles())

    const help = await run(['--plugin', HELLO_ADDRESS, '--help'], { routes })
    const unselected = await run(['my-app', '--yes', '--dry-run', '--plugin', HELLO_ADDRESS], {
      routes,
    })
    const refused = await run(
      ['my-app', '--yes', '--dry-run', '--plugin', HELLO_ADDRESS, '--hello'],
      {
        routes,
      },
    )

    expect(help.output).toContain('--hello')
    expect(unselected.exitCode).toBe(0)
    expect(refused.exitCode).toBe(1)
    expect(refused.error).toContain(
      `hello from ${HELLO_ADDRESS} comes from an untrusted source; pass --trust "${HELLO_ADDRESS}"`,
    )
    expect(await hasRun()).toBe(false)
  })

  it('runs code from an untrusted source only with --trust or a trusted pattern, also in a dry run', async () => {
    const routes = await githubRoutes('hello', helloFiles())
    const argv = ['my-app', '--yes', '--dry-run', '--plugin', HELLO_ADDRESS, '--hello']

    const flagged = await run([...argv, '--trust', 'github:acme/*'], { routes })
    await write({ 'config.json': JSON.stringify({ trust: ['github:acme/plugins/*'] }) })
    const configured = await run(argv, { routes })

    expect(flagged.output).toContain('hello.txt (1 line, hello)')
    expect(configured.output).toContain('hello.txt (1 line, hello)')
    expect(await hasRun()).toBe(true)
  })

  it('records where a remote plugin came from and its content hash in the lock', async () => {
    const routes = await githubRoutes('hello', helloFiles())

    const result = await run(
      ['my-app', '--yes', '--no-git', '--no-install', '--plugin', HELLO_ADDRESS, '--hello'],
      { routes },
    )
    const created = await run(
      [
        'my-app',
        '--yes',
        '--no-git',
        '--no-install',
        '--plugin',
        HELLO_ADDRESS,
        '--hello',
        '--trust',
        'github:acme/*',
        '--overwrite',
      ],
      { routes },
    )
    const lock = await readJson(pathOf('my-app/.next-suite/lock.json'))

    expect(result.exitCode).toBe(1)
    expect(created.exitCode).toBe(0)
    expect(lock.plugins).toContainEqual({
      name: 'hello',
      source: HELLO_ADDRESS,
      resolved: COMMIT_SHA,
      contentHash: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
    })
  })

  it('records the content of a trusted source and asks again once it changes', async () => {
    const argv = ['my-app', '--yes', '--dry-run', '--plugin', HELLO_ADDRESS, '--hello']
    await write({ 'config.json': JSON.stringify({ trust: ['github:acme/*'] }) })
    const first = await run(argv, { routes: await githubRoutes('hello', helloFiles()) })
    const { trustedContent } = await readJson(pathOf('config.json'))
    const changedRoutes = await githubRoutes('hello', {
      ...helloFiles(),
      'files/hello.txt': 'bye\n',
    })
    await rm(pathOf('cache'), { recursive: true, force: true })

    const changed = await run(argv, { routes: changedRoutes })
    const overridden = await run([...argv, '--trust', 'github:acme/*'], { routes: changedRoutes })

    expect(first.exitCode).toBe(0)
    expect(trustedContent).toEqual({
      [HELLO_ADDRESS]: [expect.stringMatching(/^sha256-[0-9a-f]{64}$/)],
    })
    expect(changed.exitCode).toBe(1)
    expect(changed.error).toContain(
      `hello from ${HELLO_ADDRESS} changed since you trusted its content sha256-`,
    )
    expect(overridden.exitCode).toBe(0)
    expect((await readJson(pathOf('config.json'))).trustedContent).toEqual(trustedContent)
  })

  it('asks in the terminal and remembers a source the user always trusts, with its content', async () => {
    const routes = await githubRoutes('hello', helloFiles())

    const result = await run(['my-app', '--dry-run', '--plugin', HELLO_ADDRESS, '--hello'], {
      isInteractive: true,
      routes,
      keys: [KEYS.enter, 'y', KEYS.up, KEYS.enter],
    })
    const config = await readJson(pathOf('config.json'))

    expect(result.output).toContain(
      `Hello (hello) from ${HELLO_ADDRESS} at ${COMMIT_SHA}, content sha256-`,
    )
    expect(result.output).toContain(
      'It comes from an untrusted source and can run code on your machine. Use it?',
    )
    expect(result.exitCode).toBe(0)
    expect(config.trust).toEqual([HELLO_ADDRESS])
    expect(config.trustedContent).toEqual({ [HELLO_ADDRESS]: [expect.stringMatching(/^sha256-/)] })
  })

  it('asks again in the terminal for changed content and keeps the new content when trusted', async () => {
    await write({
      'config.json': JSON.stringify({
        trust: ['github:acme/*'],
        trustedContent: { [HELLO_ADDRESS]: [`sha256-${'0'.repeat(64)}`] },
      }),
    })

    const result = await run(['my-app', '--dry-run', '--plugin', HELLO_ADDRESS, '--hello'], {
      isInteractive: true,
      routes: await githubRoutes('hello', helloFiles()),
      keys: [KEYS.enter, 'y', KEYS.up, KEYS.enter],
    })
    const config = await readJson(pathOf('config.json'))

    expect(result.output).toContain('changed since you trusted its content sha256-000000000000')
    expect(result.output).toContain('Trust the new content')
    expect(result.exitCode).toBe(0)
    expect(config.trustedContent).toEqual({
      [HELLO_ADDRESS]: [`sha256-${'0'.repeat(64)}`, expect.stringMatching(/^sha256-[0-9a-f]{64}$/)],
    })
  })

  it('loads a plugin of a registry by its short name', async () => {
    await write({
      'registry/registry.json': JSON.stringify({
        name: '@acme',
        plugins: [{ name: 'mail', path: 'plugins/mail', description: 'Mail.' }],
      }),
      'registry/plugins/mail/plugin.ts': pluginTs(
        "  name: 'mail',\n  title: 'Mail',\n  files: { 'mail.txt': 'files/mail.txt' },",
      ),
      'registry/plugins/mail/files/mail.txt': 'mail\n',
      'config.json': JSON.stringify({ trust: ['@acme/*'], registries: { '@acme': './registry' } }),
    })

    const result = await run([
      'my-app',
      '--yes',
      '--no-git',
      '--no-install',
      '--plugin',
      '@acme/mail',
      '--mail',
    ])
    const lock = await readJson(pathOf('my-app/.next-suite/lock.json'))

    expect(result.exitCode).toBe(0)
    expect(await readFile(pathOf('my-app/mail.txt'), 'utf8')).toBe('mail\n')
    expect(lock.plugins).toContainEqual({
      name: 'mail',
      source: '@acme/mail',
      contentHash: expect.stringMatching(/^sha256-/),
    })
  })
})
