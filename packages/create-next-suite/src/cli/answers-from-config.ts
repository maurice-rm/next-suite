import type { AnswerInput } from '../answers/answers.ts'
import { InputError } from '../input-error.ts'
import { CATEGORIES } from '../plugin-definition/categories.ts'
import type { Plugin } from '../plugin-definition/plugin-definition.ts'
import { answersOfConfig } from '../project-config/answers-of-config.ts'
import type { LoadedSuiteConfig } from '../project-config/load-suite-config.ts'
import { RUN_SETTINGS } from '../questions/run-settings.ts'
import type { ConfigAddress } from './config-addresses.ts'

const RUN_SETTING_KEYS: ReadonlySet<string> = new Set(RUN_SETTINGS.map(({ key }) => key))

type ConfigAnswerSources = {
  loaded: LoadedSuiteConfig
  plugins: readonly Plugin[]
  /** The external plugins of the config, with the name each loaded as. */
  fetched: readonly (ConfigAddress & { name: string })[]
  /** The question keys flags answered. */
  flagKeys: ReadonlySet<string>
}

/**
 * The answers a config gives. Flags may set what happens after writing, such as `--no-install`,
 * but no answer: the config is the project's only description.
 *
 * @throws InputError for a flag that answers a question of the project.
 * @throws ProjectConfigError for a config that names plugins or answers it cannot.
 */
export const answersFromConfig = ({
  loaded,
  plugins,
  fetched,
  flagKeys,
}: ConfigAnswerSources): AnswerInput => {
  const answering = [...flagKeys].filter((key) => !RUN_SETTING_KEYS.has(key))
  if (answering.length > 0) {
    throw new InputError(
      `--config takes every answer from ${loaded.path}; change it there instead of passing flags for: ${answering.join(', ')}`,
    )
  }
  return answersOfConfig(loaded.config, {
    plugins,
    categories: CATEGORIES,
    nameOfEntry: (entry) => fetched.find((plugin) => plugin.entry === entry)?.name,
  })
}
