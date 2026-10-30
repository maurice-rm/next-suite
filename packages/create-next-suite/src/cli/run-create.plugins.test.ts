import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { KEYS } from '../test-support/keys.ts'
import { readJson } from '../test-support/read-json.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { COMMIT_SHA } from '../test-support/stub-remote.ts'
import { testManifestJson } from '../test-support/test-manifest.ts'

const { run, pathOf, write, githubRoutes } = setUpCreateRuns()

describe('runCreate with external plugins', () => {
  it('adds a plugin from a local directory, with its flag, its files and its source', async () => {
    await write({
      'mail/plugin.json': testManifestJson('mail', {
        section: 'Integrations',
        files: [{ source: 'mail.ts', target: 'lib/mail.ts' }],
      }),
      'mail/mail.ts': 'export const mail = true\n',
    })

    const help = await run(['--plugin', './mail', '--help'])
    const result = await run(['my-app', '--yes', '--plugin', './mail', '--mail', '--no-git'])
    const recorded = await readJson(pathOf('my-app/next-suite.json'))

    expect(help.output).toContain('--mail')
    expect(result.exitCode).toBe(0)
    expect(await readFile(pathOf('my-app/lib/mail.ts'), 'utf8')).toBe('export const mail = true\n')
    expect(recorded.plugins).toContainEqual({ name: 'mail', source: './mail', version: '1.0.0' })
    expect(recorded.answers).toMatchObject({ mail: true })
  })

  it('rejects an external plugin with the name of a built-in one, and an unknown address', async () => {
    await write({ 'npm/plugin.json': testManifestJson('npm') })

    expect((await run(['my-app', '--yes', '--plugin', './npm'])).error).toContain(
      'two plugins are named npm',
    )
    expect((await run(['my-app', '--yes', '--plugin', 'mail'])).error).toContain(
      'the address has no known form',
    )
  })

  it('runs the logic module of a plugin: computed files, contributions and dependencies', async () => {
    await write({
      'hello/plugin.json': testManifestJson('hello', {
        logic: 'logic.ts',
        selectedByDefault: true,
      }),
      'hello/logic.ts': [
        'export default (context) => ({',
        '  files: [{ target: "lib/hello.ts", content: "export const name = " + JSON.stringify(context.project.name) + "\\n" }],',
        '  contributes: { gitignore: ["/hello-cache"], stack: ["Hello"] },',
        '  devDependencies: { zod: "4.6.7" },',
        '})',
        '',
      ].join('\n'),
    })

    const result = await run(['my-app', '--yes', '--plugin', './hello', '--dry-run', '--diff'])

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('lib/hello.ts (1 line, hello)')
    expect(result.output).toContain('+export const name = "my-app"')
    expect(result.output).toContain('zod 4.6.7')
  })

  it('rejects a logic module that answers something invalid', async () => {
    await write({
      'broken/plugin.json': testManifestJson('broken', {
        logic: 'logic.ts',
        selectedByDefault: true,
      }),
      'broken/logic.ts': 'export default () => ({ files: "nope" })\n',
    })

    const result = await run(['my-app', '--yes', '--plugin', './broken', '--dry-run'])

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('broken: its logic answers something invalid')
  })

  it('needs trust for a plugin from GitHub even without a logic module, since it writes and runs', async () => {
    const routes = await githubRoutes('mail', {
      'plugin.json': testManifestJson('mail', { selectedByDefault: true }),
    })

    const argv = ['my-app', '--yes', '--no-git', '--plugin', 'github:acme/plugins/mail']
    const refused = await run(argv, { routes })
    const result = await run([...argv, '--trust', 'github:acme/*'], { routes })
    const recorded = await readJson(pathOf('my-app/next-suite.json'))

    expect(refused.error).toContain('comes from an untrusted source')
    expect(result.exitCode).toBe(0)
    expect(recorded.plugins).toContainEqual({
      name: 'mail',
      source: 'github:acme/plugins/mail',
      resolved: COMMIT_SHA,
      version: '1.0.0',
    })
  })

  it('runs code from an untrusted source only with --trust or a trusted pattern', async () => {
    const routes = await githubRoutes('hello', {
      'plugin.json': testManifestJson('hello', { logic: 'logic.ts', selectedByDefault: true }),
      'logic.ts': 'export default () => ({ files: [{ target: "hello.txt", content: "hi\\n" }] })\n',
    })
    const argv = ['my-app', '--yes', '--dry-run', '--plugin', 'github:acme/plugins/hello']

    const refused = await run(argv, { routes })
    const flagged = await run([...argv, '--trust', 'github:acme/*'], { routes })
    await write({ 'config.json': JSON.stringify({ trust: ['github:acme/plugins/*'] }) })
    const configured = await run(argv, { routes })

    expect(refused.exitCode).toBe(1)
    expect(refused.error).toContain('comes from an untrusted source; pass --trust')
    expect(flagged.output).toContain('hello.txt (1 line, hello)')
    expect(configured.output).toContain('hello.txt (1 line, hello)')
  })

  it('asks in the terminal and remembers a source the user always trusts', async () => {
    const routes = await githubRoutes('hello', {
      'plugin.json': testManifestJson('hello', { logic: 'logic.ts', selectedByDefault: true }),
      'logic.ts': 'export default () => ({})\n',
    })

    const result = await run(['my-app', '--dry-run', '--plugin', 'github:acme/plugins/hello'], {
      isInteractive: true,
      routes,
      keys: [KEYS.enter, 'y', KEYS.up, KEYS.enter],
    })

    expect(result.output).toContain('can run code on your machine. Use it?')
    expect((await readJson(pathOf('config.json'))).trust).toEqual(['github:acme/plugins/hello'])
  })

  it('loads a plugin of a registry by its short name', async () => {
    await write({
      'registry/registry.json': JSON.stringify({
        name: '@acme',
        plugins: [{ name: 'mail', path: 'plugins/mail', description: 'Mail.' }],
      }),
      'registry/plugins/mail/plugin.json': testManifestJson('mail', { selectedByDefault: true }),
      'config.json': JSON.stringify({ trust: ['@acme/*'], registries: { '@acme': './registry' } }),
    })

    const result = await run(['my-app', '--yes', '--no-git', '--plugin', '@acme/mail'])
    const recorded = await readJson(pathOf('my-app/next-suite.json'))

    expect(result.exitCode).toBe(0)
    expect(recorded.plugins).toContainEqual({
      name: 'mail',
      source: '@acme/mail',
      version: '1.0.0',
    })
  })
})
