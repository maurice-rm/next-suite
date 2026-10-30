import type { Setting } from './base-settings.ts'

/** The section of the wizard that asks what happens after the files are written. */
export const SETUP_SECTION = 'Setup'

/** The setting whether the run installs the dependencies. */
export const INSTALL_SETTING = 'install'

/** The setting whether the run creates a git repository with a first commit. */
export const GIT_SETTING = 'git'

/**
 * The settings of a run rather than of the project: asked last in the wizard, never recorded in
 * next-suite.json, and without the wizard they take their default.
 */
export const RUN_SETTINGS: readonly Setting[] = [
  {
    key: GIT_SETTING,
    option: {
      type: 'boolean',
      question: 'Initialize a git repository?',
      description: 'initialize a git repository',
      default: true,
    },
  },
  {
    key: INSTALL_SETTING,
    option: {
      type: 'boolean',
      question: 'Install dependencies?',
      description: 'install the dependencies',
      default: true,
    },
  },
]
