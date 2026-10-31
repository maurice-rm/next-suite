import type { Answer } from '../plugin-definition/plugin-option.ts'
import type { LockedProject } from './lock-file.ts'
import { CONFIG_MODULE } from './project-paths.ts'

/** Prettier's and Biome's line width, so the format run of a new project leaves the file as it is. */
const LINE_WIDTH = 80
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const PLUGINS_KEY = '  plugins: '
const ENTRY_INDENT = '    '
const PLUGINS_HINT = [
  '  // Your own plugins join these: "./next-suite/plugins/<name>", an address such as',
  '  // "github:acme/plugins/mail#v1", or definePlugin({ … }) in place.',
]
const EXTENDS_HINT = '  // extends: a shared config to start from; not supported yet.'

/** What a new project's config says: its settings, its plugin entries and every answer. */
export type SuiteConfigSource = {
  project: LockedProject
  /** Built-in plugins by name, the others by the address or path they were loaded from. */
  plugins: readonly string[]
  /** The answers by plugin and option; a plugin without options is left out. */
  answers: Readonly<Record<string, Readonly<Record<string, Answer>>>>
}

const keyOf = (name: string): string => (IDENTIFIER.test(name) ? name : JSON.stringify(name))

const literalOf = (value: Answer): string =>
  Array.isArray(value)
    ? `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
    : JSON.stringify(value)

const renderPlugins = (plugins: readonly string[]): string[] => {
  const inline = `${PLUGINS_KEY}[${plugins.map((entry) => JSON.stringify(entry)).join(', ')}],`
  if (inline.length <= LINE_WIDTH) {
    return [inline]
  }
  return [
    `${PLUGINS_KEY}[`,
    ...plugins.map((entry) => `${ENTRY_INDENT}${JSON.stringify(entry)},`),
    '  ],',
  ]
}

const renderAnswers = (answers: SuiteConfigSource['answers']): string[] => {
  const entries = Object.entries(answers).filter(([, options]) => Object.keys(options).length > 0)
  if (entries.length === 0) {
    return ['  answers: {},']
  }
  return [
    '  answers: {',
    ...entries.map(([plugin, options]) => {
      const fields = Object.entries(options).map(
        ([key, value]) => `${keyOf(key)}: ${literalOf(value)}`,
      )
      return `${ENTRY_INDENT}${keyOf(plugin)}: { ${fields.join(', ')} },`
    }),
    '  },',
  ]
}

/**
 * The `next-suite.config.ts` a new project starts with: every setting, every plugin and every
 * answer, written out so the config alone creates the same project again. From then on the file
 * belongs to the project; create-next-suite reads it, and only `next-suite add` and `disable`
 * edit it.
 */
export const renderSuiteConfig = ({ project, plugins, answers }: SuiteConfigSource): string =>
  [
    `import { defineSuiteConfig } from ${JSON.stringify(CONFIG_MODULE)};`,
    '',
    'export default defineSuiteConfig({',
    '  project: {',
    ...Object.entries(project).map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`),
    '  },',
    ...PLUGINS_HINT,
    ...renderPlugins(plugins),
    '  disable: [],',
    ...renderAnswers(answers),
    EXTENDS_HINT,
    '});',
    '',
  ].join('\n')
