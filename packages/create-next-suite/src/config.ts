/**
 * The project config of create-next-suite. Every generated project has a `next-suite.config.ts`
 * whose default export is `defineSuiteConfig({…})`: the project's settings, its plugins (built-in
 * ones by name, project plugins by path, external ones by address, or a plugin defined in place
 * with `definePlugin`), the plugins it disables and the answers to their options. The generated
 * `.next-suite/types.d.ts` fills `PluginRegistry`, so the editor checks every name and answer.
 *
 * @example
 * ```ts
 * import { definePlugin, defineSuiteConfig } from 'create-next-suite/config'
 *
 * export default defineSuiteConfig({
 *   project: { name: 'my-app' },
 *   plugins: [
 *     'pnpm',
 *     'pino',
 *     './next-suite/plugins/tweaks',
 *     definePlugin({ name: 'site-url', title: 'Site URL', scripts: { url: 'echo $SITE_URL' } }),
 *   ],
 *   answers: { pino: { level: 'debug' } },
 * })
 * ```
 *
 * @packageDocumentation
 */
export { definePlugin } from './plugin-definition/define-plugin.ts'
export {
  defineSuiteConfig,
  type ExternalPluginAddress,
  type LocalPluginPath,
  type PluginAnswers,
  type PluginEntry,
  type PluginName,
  type PluginRegistry,
  type ProjectSettings,
  type SuiteConfig,
} from './project-config/suite-config.ts'
