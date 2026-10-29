import type { AnswerValue } from '../answers/answers.ts'
import { type ParsedPluginManifest, pluginManifestSchema } from '../contract/plugin-manifest.ts'

const SETTINGS_ORIGIN = 'base-settings'
const REACT_COMPILER_SETTING = 'react-compiler'
const CACHE_COMPONENTS_SETTING = 'cache-components'

/**
 * What the base settings add to the shared files, written as a manifest so they merge like any
 * plugin: the React Compiler needs its Babel plugin and the `reactCompiler` option, Cache
 * Components the `cacheComponents` and `partialPrefetching` options (Next.js docs 16.4,
 * next.config.js reference).
 */
export const settingContributions = (
  settings: Readonly<Record<string, AnswerValue>>,
): ParsedPluginManifest => {
  const usesReactCompiler = settings[REACT_COMPILER_SETTING] === true
  const usesCacheComponents = settings[CACHE_COMPONENTS_SETTING] === true
  return pluginManifestSchema.parse({
    name: SETTINGS_ORIGIN,
    version: '1.0.0',
    contract: '^1.0.0',
    title: 'Base settings',
    description: 'What the base settings add to the shared files.',
    devDependencies: usesReactCompiler
      ? { 'babel-plugin-react-compiler': 'catalog:babel-plugin-react-compiler' }
      : {},
    contributes: {
      nextConfig: {
        options: [
          ...(usesReactCompiler ? [{ key: 'reactCompiler', value: 'true' }] : []),
          ...(usesCacheComponents
            ? [
                { key: 'cacheComponents', value: 'true' },
                { key: 'partialPrefetching', value: 'true' },
              ]
            : []),
        ],
      },
    },
  })
}
