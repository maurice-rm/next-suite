import type { LoadedSuiteConfig } from '../project-config/load-suite-config.ts'
import { readProjectInputs } from '../project-config/read-project-inputs.ts'
import type { ConfigSource } from './plan-project.ts'

/** The config a project is created from, with its inputs read from beside it. */
export const readConfigSource = async (suiteConfig: LoadedSuiteConfig): Promise<ConfigSource> => ({
  text: suiteConfig.text,
  inputs: await readProjectInputs(suiteConfig.directory),
  disable: suiteConfig.config.disable ?? [],
})
