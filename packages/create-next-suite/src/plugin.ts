/**
 * The plugin contract of create-next-suite: `definePlugin`, the collector points a point module
 * augments, and the collectors of the shared points: the built dependencies a package manager
 * plugin provides, the lint ignores a linter plugin provides and the CI checks a CI plugin
 * provides.
 *
 * @packageDocumentation
 */
export type { CollectorPoints } from './plugin-definition/collector-point.ts'
export { definePlugin } from './plugin-definition/define-plugin.ts'
export { createBuiltDependencies } from './points/built-dependencies.ts'
export { createCiChecks } from './points/ci-checks.ts'
export { createLintIgnores } from './points/lint-ignores.ts'
