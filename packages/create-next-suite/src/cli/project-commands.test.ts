import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { setUpCreateRuns } from '../test-support/run-create-harness.ts'
import { runNextSuiteIn } from '../test-support/run-next-suite-harness.ts'

const { run: create, pathOf } = setUpCreateRuns()

const nextSuite = (argv: string[], cwd: string) => runNextSuiteIn({ root: cwd, cwd }, argv)

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

describe('next-suite eject', () => {
  it('turns the project into a plain Next.js project', async () => {
    await createProject()

    const result = await nextSuite(['eject'], pathOf('my-app'))

    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('Removed next-suite.config.ts')
    expect(result.output).toContain('the devDependency create-next-suite in package.json')
    expect(existsSync(pathOf('my-app/.next-suite'))).toBe(false)
    expect(existsSync(pathOf('my-app/app/page.tsx'))).toBe(true)
  })

  it('refuses while next-suite/ holds your files, unless forced', async () => {
    await createProject()
    await rm(pathOf('my-app/knip.config.ts'))
    const overrides = pathOf('my-app/next-suite/overrides')
    await mkdir(overrides, { recursive: true })
    await writeFile(join(overrides, 'page.tsx'), 'mine\n')

    const refused = await nextSuite(['eject'], pathOf('my-app'))
    const forced = await nextSuite(['eject', '--force'], pathOf('my-app'))

    expect(refused.exitCode).toBe(1)
    expect(refused.error).toContain('next-suite/overrides/page.tsx')
    expect(forced.exitCode).toBe(0)
    expect(existsSync(pathOf('my-app/next-suite'))).toBe(false)
  })
})
