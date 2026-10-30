import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ansis from 'ansis'
import { describe, expect, it } from 'vitest'

import { collectOutput } from '../test-support/collect-output.ts'
import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { stubRemote } from '../test-support/stub-remote.ts'
import { runNextSuite } from './run-next-suite.ts'

const PLUGIN_ENTRY = fileURLToPath(new URL('../plugin.ts', import.meta.url))

const { run: create, pathOf } = setUpCreateRuns()

const nextSuite = async (argv: string[], cwd: string) => {
  const output = collectOutput()
  const error = collectOutput()
  const exitCode = await runNextSuite({
    argv,
    cliVersion: '2.0.0',
    cwd,
    output: output.stream,
    error: error.stream,
    remote: stubRemote(cwd),
    userConfigPath: join(cwd, 'config.json'),
    pluginEntry: PLUGIN_ENTRY,
    runCommand: async () => ({ isSuccess: false, output: '' }),
  })
  return { exitCode, output: output.text(), error: ansis.strip(error.text()) }
}

const createProject = () => create(['my-app', '--yes', '--no-ci', '--no-git', '--no-install'])

describe('next-suite explain', () => {
  it('shows who wrote a file and what each plugin did to it', async () => {
    await createProject()

    const result = await nextSuite(['explain', 'next.config.ts'], pathOf('my-app'))

    expect(result.exitCode).toBe(0)
    expect(result.output).toBe(
      [
        'next.config.ts: written by base, unchanged since it was generated',
        '  1. base        base                                   own',
        '  2. static-csp  nextConfig.imports ./security-headers  extend',
        '  3. static-csp  nextConfig.options headers             extend',
        '',
      ].join('\n'),
    )
  })

  it('takes a path relative to the current directory and sees a changed file', async () => {
    await createProject()
    await writeFile(pathOf('my-app/app/page.tsx'), 'export default function Page() {}\n')

    const result = await nextSuite(['explain', 'page.tsx'], pathOf('my-app/app'))

    expect(result.output).toMatch(
      /^app\/page\.tsx: written by base, changed since it was generated\n/,
    )
  })

  it('refuses a directory', async () => {
    await createProject()

    const result = await nextSuite(['explain', 'app'], pathOf('my-app'))

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('app is a directory; explain takes a file')
  })

  it('fails outside a next-suite project', async () => {
    const result = await nextSuite(['explain', 'x.ts'], pathOf('.'))

    expect(result.exitCode).toBe(1)
    expect(result.error).toContain('lies in no next-suite project')
  })
})
