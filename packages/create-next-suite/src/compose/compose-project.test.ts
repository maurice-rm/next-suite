import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Answers } from '../answers/answers.ts'
import { type LoadedPlugin, loadPlugin } from '../loader/load-plugin.ts'
import { composeProject } from './compose-project.ts'

const CREATED_AT = new Date('2026-11-01T10:00:00Z')
const CATALOG = { next: '16.4.3', bun: '1.4.4' }

let root: string

const writePlugin = async (
  name: string,
  manifest: object,
  files: Record<string, string> = {},
): Promise<LoadedPlugin> => {
  const folder = join(root, name)
  const entries = {
    'plugin.json': JSON.stringify({
      name,
      version: '1.0.0',
      engine: '^1.0.0',
      title: name,
      description: name,
      ...manifest,
    }),
    ...files,
  }
  for (const [path, content] of Object.entries(entries)) {
    await mkdir(dirname(join(folder, path)), { recursive: true })
    await writeFile(join(folder, path), content)
  }
  return loadPlugin(folder)
}

const writeBase = (
  extraFiles: object[] = [],
  files: Record<string, string> = {},
): Promise<LoadedPlugin> =>
  writePlugin(
    'base',
    {
      dependencies: { next: 'catalog:next' },
      contributes: {
        package: { scripts: { dev: 'next dev' }, fields: { private: true } },
        gitignore: ['.next'],
      },
      files: [
        { source: 'files/gitignore.hbs', target: '.gitignore' },
        { source: 'files/env.example.hbs', target: '.env.example' },
        { source: 'files/page.tsx.hbs', target: 'app/page.tsx', root: 'source' },
        ...extraFiles,
      ],
    },
    {
      'files/gitignore.hbs': '{{#each gitignore}}{{this}}\n{{/each}}',
      'files/env.example.hbs':
        '{{#each env.groups}}# {{title}}\n{{#each variables}}{{name}}={{example}}\n{{/each}}{{/each}}',
      'files/page.tsx.hbs': 'export default function Page() { return <h1>{{project.name}}</h1> }\n',
      ...files,
    },
  )

const DRIZZLE_MANIFEST = {
  category: 'orm',
  env: [
    {
      name: 'DATABASE_URL',
      scope: 'server',
      secret: true,
      example: 'postgres://localhost/app',
      description: 'Database.',
    },
  ],
  contributes: { gitignore: ['drizzle/meta'] },
  files: [{ source: 'files/db.ts.hbs', target: 'lib/db.ts', root: 'source' }],
}

const answersWith = (
  plugins: Answers['plugins'],
  settings: Answers['settings'] = { 'src-dir': false },
): Answers => ({
  plugins,
  settings,
  options: {},
})

const compose = async (base: LoadedPlugin, selected: LoadedPlugin[], answers: Answers) =>
  composeProject({
    projectName: 'my-app',
    base,
    available: selected,
    selected,
    answers,
    recordedAnswers: { recorded: true },
    catalog: CATALOG,
    cliVersion: '2.0.0',
    createdAt: CREATED_AT,
  })

const contentOf = (plan: Awaited<ReturnType<typeof compose>>, path: string): string | undefined =>
  plan.files.find((file) => file.path === path)?.content

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'next-suite-compose-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('composeProject', () => {
  it('renders the files of the base project and the plugins with the merged contributions', async () => {
    const base = await writeBase()
    const drizzle = await writePlugin('drizzle', DRIZZLE_MANIFEST, {
      'files/db.ts.hbs':
        '{{#if (has "category:orm")}}export const url = process.env.DATABASE_URL{{/if}}\n',
    })

    const plan = await compose(base, [drizzle], answersWith([{ name: 'drizzle', category: 'orm' }]))

    expect(plan.files.map((file) => `${file.path} ${file.origin}`)).toEqual([
      '.env.example base',
      '.gitignore base',
      'app/page.tsx base',
      'lib/db.ts drizzle',
      'next-suite.json create-next-suite',
      'package.json create-next-suite',
    ])
    expect(contentOf(plan, '.gitignore')).toBe('.next\ndrizzle/meta\n')
    expect(contentOf(plan, '.env.example')).toBe(
      '# drizzle\nDATABASE_URL=postgres://localhost/app\n',
    )
    expect(contentOf(plan, 'lib/db.ts')).toBe('export const url = process.env.DATABASE_URL\n')
  })

  it('writes package.json from the contributions', async () => {
    const plan = await compose(await writeBase(), [], answersWith([]))

    expect(JSON.parse(contentOf(plan, 'package.json') ?? '')).toEqual({
      name: 'my-app',
      private: true,
      scripts: { dev: 'next dev' },
      dependencies: { next: '16.4.3' },
      devDependencies: {},
    })
  })

  it('writes the fields of the package manager and the builds other plugins allow', async () => {
    const bun = await writePlugin('bun', {
      category: 'package-manager',
      packageManager: {
        version: 'catalog:bun',
        onFail: 'warn',
        allowedBuilds: 'trusted-dependencies',
      },
    })
    const sharp = await writePlugin('images', { contributes: { allowedBuilds: ['sharp'] } })
    const answers = answersWith([
      { name: 'bun', category: 'package-manager' },
      { name: 'images', category: undefined },
    ])

    const plan = await compose(await writeBase(), [bun, sharp], answers)
    const packageJson = JSON.parse(contentOf(plan, 'package.json') ?? '')

    expect(Object.keys(packageJson)).toEqual([
      'name',
      'private',
      'packageManager',
      'scripts',
      'dependencies',
      'devDependencies',
      'devEngines',
      'trustedDependencies',
    ])
    expect(plan.packageManager).toBe('bun')
    expect(packageJson).toMatchObject({
      packageManager: 'bun@1.4.4',
      devEngines: { packageManager: { name: 'bun', version: '^1.4.4', onFail: 'warn' } },
      trustedDependencies: ['sharp'],
    })
  })

  it('lists the post-step scripts whose condition holds, in plugin order', async () => {
    const formatter = await writePlugin('formatter', {
      contributes: { package: { scripts: { format: 'prettier --write .', check: 'tsc' } } },
      postSteps: [{ script: 'format' }, { script: 'check', when: { category: 'orm' } }],
    })

    const plan = await compose(await writeBase(), [formatter], answersWith([]))

    expect(plan.postSteps).toEqual(['format'])
    expect(plan.packageManager).toBeUndefined()
  })

  it('rejects a post-step whose script no plugin defines', async () => {
    for (const script of ['format', 'constructor']) {
      const formatter = await writePlugin(`formatter-${script}`, { postSteps: [{ script }] })

      await expect(compose(await writeBase(), [formatter], answersWith([]))).rejects.toThrow(
        `formatter-${script} runs the script "${script}" after the install, but no plugin defines it`,
      )
    }
  })

  it('records the run in next-suite.json', async () => {
    const drizzle = await writePlugin('drizzle', DRIZZLE_MANIFEST, { 'files/db.ts.hbs': '' })
    const answers = {
      ...answersWith([{ name: 'drizzle', category: 'orm' }]),
      options: { 'drizzle.casing': 'snake' },
    }

    const plan = await compose(await writeBase(), [drizzle], answers)

    expect(JSON.parse(contentOf(plan, 'next-suite.json') ?? '')).toEqual({
      cli: '2.0.0',
      contract: '1.0.0',
      createdAt: '2026-11-01T10:00:00.000Z',
      plugins: [{ name: 'drizzle', source: 'builtin', version: '1.0.0' }],
      answers: { recorded: true },
    })
  })

  it('places source files under src/ when the project uses a src folder', async () => {
    const plan = await compose(await writeBase(), [], answersWith([], { 'src-dir': true }))

    expect(plan.files.map((file) => file.path)).toContain('src/app/page.tsx')
  })

  it('skips a file whose condition does not hold', async () => {
    const base = await writeBase(
      [{ source: 'files/extra.ts', target: 'extra.ts', when: { category: 'orm' } }],
      { 'files/extra.ts': '' },
    )

    const plan = await compose(base, [], answersWith([]))

    expect(plan.files.map((file) => file.path)).not.toContain('extra.ts')
  })

  it('rejects two plugins writing different content to one file', async () => {
    const drizzle = await writePlugin('drizzle', DRIZZLE_MANIFEST, { 'files/db.ts.hbs': 'a' })
    const other = await writePlugin(
      'other',
      { files: [{ source: 'db.ts', target: 'lib/db.ts', root: 'source' }] },
      { 'db.ts': 'b' },
    )

    await expect(compose(await writeBase(), [drizzle, other], answersWith([]))).rejects.toThrow(
      'drizzle and other both write lib/db.ts',
    )
  })

  it('lets a plugin replace a file of a plugin it requires, whatever their order', async () => {
    const drizzle = await writePlugin('drizzle', DRIZZLE_MANIFEST, {
      'files/db.ts.hbs': 'original',
    })
    const extra = await writePlugin(
      'a-extra',
      {
        requires: [{ when: { plugin: 'drizzle' }, reason: 'Extends the client.' }],
        files: [{ source: 'db.ts', target: 'lib/db.ts', root: 'source', conflict: 'replace' }],
      },
      { 'db.ts': 'replaced' },
    )

    const plan = await compose(await writeBase(), [extra, drizzle], answersWith([]))

    expect(contentOf(plan, 'lib/db.ts')).toBe('replaced')
  })

  it('rejects a target that leaves the project', async () => {
    const evil = await writePlugin(
      'evil',
      { files: [{ source: 'x', target: '../escape.txt' }] },
      { x: '' },
    )

    await expect(compose(await writeBase(), [evil], answersWith([]))).rejects.toThrow(
      'evil writes to "../escape.txt"',
    )
  })

  it('copies a source without .hbs as it is, braces included', async () => {
    const component = 'export const Box = () => <div style={{ color: "red" }} />\n'
    const ui = await writePlugin(
      'ui',
      { files: [{ source: 'files/box.tsx', target: 'box.tsx' }] },
      { 'files/box.tsx': component },
    )

    const plan = await compose(await writeBase(), [ui], answersWith([]))

    expect(contentOf(plan, 'box.tsx')).toBe(component)
  })

  it('names the plugin and file of a template that does not render', async () => {
    const broken = await writePlugin(
      'broken',
      { files: [{ source: 'x.ts.hbs', target: 'x.ts' }] },
      { 'x.ts.hbs': '{{options.missing}}' },
    )

    await expect(compose(await writeBase(), [broken], answersWith([]))).rejects.toThrow(
      'broken: x.ts.hbs does not render',
    )
  })

  it('rejects a condition in a file of the base project', async () => {
    const base = await writeBase([{ source: 'files/if.ts.hbs', target: 'if.ts' }], {
      'files/if.ts.hbs': '{{#if (has "category:orm")}}x{{/if}}',
    })
    const drizzle = await writePlugin('drizzle', DRIZZLE_MANIFEST, { 'files/db.ts.hbs': '' })

    await expect(compose(base, [drizzle], answersWith([]))).rejects.toThrow(
      'base: files/if.ts.hbs does not render',
    )
  })
})
