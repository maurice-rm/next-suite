/** The package a project depends on to run next-suite and type its config. */
export const CLI_PACKAGE = 'create-next-suite'

/** The module a project's config imports `defineSuiteConfig` from. */
export const CONFIG_MODULE = `${CLI_PACKAGE}/config`

/**
 * Where next-suite keeps what describes a project, relative to its root: the config the user
 * owns, the directory create-next-suite writes on every generation, and the directory of the
 * project's own plugins and overrides.
 */
export const PROJECT_PATHS = {
  config: 'next-suite.config.ts',
  generatorDirectory: '.next-suite',
  lock: '.next-suite/lock.json',
  registryTypes: '.next-suite/types.d.ts',
  inputDirectory: 'next-suite',
  plugins: 'next-suite/plugins',
  overrides: 'next-suite/overrides',
} as const
