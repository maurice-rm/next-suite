/**
 * The plugin contract of create-next-suite. A plugin is a `plugin.ts` whose default export is
 * `definePlugin({…})`: its metadata, the points it uses and provides, and what it adds to the
 * project, each field a value or a function of the plugin's context. Points connect plugins
 * without naming each other: a value point carries one value from its provider to every user, a
 * collector point gathers what other plugins contribute until its provider finishes it into
 * files. This entry also holds the collectors of the shared points: the built dependencies a
 * package manager plugin provides, the lint ignores a linter plugin provides and the CI checks a
 * CI plugin provides.
 *
 * @example
 * ```ts
 * import { definePlugin } from 'create-next-suite/plugin'
 *
 * export default definePlugin({
 *   name: 'next-themes',
 *   title: 'next-themes',
 *   description: 'Switches between a light and a dark theme.',
 *   dependencies: { 'next-themes': '0.4.6' },
 *   files: { '@/components/theme-provider.tsx': 'files/theme-provider.tsx' },
 *   layout: {
 *     imports: [{ names: ['ThemeProvider'], from: '@/components/theme-provider' }],
 *     wrapChildren: { component: 'ThemeProvider', props: { attribute: 'class' } },
 *     htmlAttributes: { suppressHydrationWarning: true },
 *   },
 * })
 * ```
 *
 * @packageDocumentation
 */
export type { ModuleImport } from './code-edit/module-import.ts'
export type { ObjectLiteral } from './code-edit/object-literal.ts'
export type { TypescriptModule } from './code-edit/typescript-module.ts'
export {
  type CollectorPoint,
  type CollectorPoints,
  defineCollectorPoint,
} from './plugin-definition/collector-point.ts'
export { definePlugin } from './plugin-definition/define-plugin.ts'
export type { NextStep } from './plugin-definition/next-step.ts'
export { optional } from './plugin-definition/optional.ts'
export type {
  FinishContext,
  PluginContext,
  ProjectPackageManager,
} from './plugin-definition/plugin-context.ts'
export type {
  EnvEntry,
  FileEdit,
  FileEntry,
  InstrumentationContribution,
  LayoutContribution,
  NextConfigContribution,
  Plugin,
  PluginDefinition,
} from './plugin-definition/plugin-definition.ts'
export type { OptionChoice, PluginOption } from './plugin-definition/plugin-option.ts'
export type { PluginProject } from './plugin-definition/plugin-project.ts'
export type { PostStep, RunSettings } from './plugin-definition/post-step.ts'
export type { Precondition, PreconditionContext } from './plugin-definition/precondition.ts'
export type { OptionalPoint, UsedPoint } from './plugin-definition/used-point.ts'
export {
  defineValuePoint,
  type ValuePoint,
  type ValuePoints,
} from './plugin-definition/value-point.ts'
export { type BuiltDependencies, createBuiltDependencies } from './points/built-dependencies.ts'
export { type CiChecks, createCiChecks } from './points/ci-checks.ts'
export { createLintIgnores, type LintIgnores } from './points/lint-ignores.ts'
