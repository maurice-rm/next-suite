import type { PluginOption } from '../contract/plugin-option.ts'

/** The section of the wizard that asks the base settings, next to the project name. */
export const BASE_SETTINGS_SECTION = 'Project'

/** A base setting the core and the base project read themselves; asked like a plugin option. */
export type BaseSetting = { key: string; option: PluginOption }

/** The base settings, with the defaults of create-next-app where it has them. */
export const BASE_SETTINGS: readonly BaseSetting[] = [
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
