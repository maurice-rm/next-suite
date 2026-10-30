import type { PluginOption } from '../contract/plugin-option.ts'

/** The section of the wizard that asks the project name and offers the quick start. */
export const PROJECT_SECTION = 'Project'

/** A setting the core reads itself, asked like a plugin option. */
export type Setting = { key: string; option: PluginOption }

/**
 * The base settings, which the core and the base project read, with the defaults of
 * create-next-app where it has them. They are never asked in the wizard, only set by flag or
 * answer file, and otherwise take their default.
 */
export const BASE_SETTINGS: readonly Setting[] = [
  {
    key: 'src-dir',
    option: { type: 'boolean', question: 'Put the code inside a src/ directory?', default: false },
  },
  {
    key: 'import-alias',
    option: { type: 'string', question: 'Which import alias?', default: '@/*' },
  },
  {
    key: 'react-compiler',
    option: { type: 'boolean', question: 'Use the React Compiler?', default: false },
  },
  {
    key: 'cache-components',
    option: { type: 'boolean', question: 'Enable Cache Components?', default: true },
  },
]
