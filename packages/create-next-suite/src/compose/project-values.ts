import type { Answers } from '../answers/answers.ts'
import type { VersionCatalog } from '../contract/version-catalog.ts'
import { ComposeError } from './compose-error.ts'
import type { SelectedPackageManager } from './package-manager-fields.ts'
import { resolveVersion } from './resolve-version.ts'

export const SOURCE_DIRECTORY = 'src'
const SRC_DIR_SETTING = 'src-dir'
const IMPORT_ALIAS_SETTING = 'import-alias'
const DEFAULT_IMPORT_ALIAS = '@/*'
/** An alias such as `@/*` or `~/*`: no spaces or quotes, ending in `/*` like create-next-app. */
const IMPORT_ALIAS = /^[^\s"'\\]+\/\*$/
const FALLBACK_PACKAGE_MANAGER = 'npm'
const DEFAULT_CI_INSTALL_ARGS = ['ci']

/** Values about the project itself that templates read under `project`. */
export type ProjectValues = {
  name: string
  /** The import alias, such as `@/*`, and the directory it points to, such as `./src/*`. */
  importAlias: string
  importAliasTarget: string
  /** What an import through the alias starts with, such as `@/`. */
  importPrefix: string
  packageManager: string
  /**
   * The exact version of the package manager, such as `12.16.1`; only with a package manager
   * plugin.
   */
  packageManagerVersion?: string
  /** How a script runs with the package manager, such as `pnpm run`. */
  run: string
  /** The install command for CI that keeps the lockfile, such as `npm ci`. */
  ciInstall: string
}

type ProjectValuesInput = {
  projectName: string
  answers: Answers
  packageManager: SelectedPackageManager | undefined
  catalog: VersionCatalog
}

export const importAliasOf = (answers: Answers): string => {
  const alias = answers.settings[IMPORT_ALIAS_SETTING]
  const importAlias = typeof alias === 'string' ? alias : DEFAULT_IMPORT_ALIAS
  if (!IMPORT_ALIAS.test(importAlias)) {
    throw new ComposeError(
      `the import alias "${importAlias}" is invalid; use a pattern such as "@/*" or "~/*"`,
    )
  }
  return importAlias
}

/** Whether the project keeps its source files under `src/`. */
export const usesSourceDirectory = (answers: Answers): boolean =>
  answers.settings[SRC_DIR_SETTING] === true

export const projectValues = ({
  projectName,
  answers,
  packageManager,
  catalog,
}: ProjectValuesInput): ProjectValues => {
  const importAlias = importAliasOf(answers)
  const command = packageManager?.name ?? FALLBACK_PACKAGE_MANAGER
  const sourceRoot = usesSourceDirectory(answers) ? `./${SOURCE_DIRECTORY}/` : './'
  return {
    name: projectName,
    importAlias,
    importAliasTarget: `${sourceRoot}*`,
    importPrefix: importAlias.slice(0, -1),
    packageManager: command,
    ...(packageManager === undefined
      ? {}
      : {
          packageManagerVersion: resolveVersion(
            packageManager.packageManager.version,
            catalog,
            packageManager.name,
          ),
        }),
    run: `${command} run`,
    ciInstall: [
      command,
      ...(packageManager?.packageManager.ciInstallArgs ?? DEFAULT_CI_INSTALL_ARGS),
    ].join(' '),
  }
}
