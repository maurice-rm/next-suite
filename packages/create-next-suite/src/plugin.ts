/**
 * The plugin contract of create-next-suite: the types a plugin's manifest follows. Plugins import
 * types only.
 *
 * @example
 * ```ts
 * import type { PluginManifest } from 'create-next-suite/plugin'
 *
 * const manifest: PluginManifest = {
 *   name: 'acme-auth',
 *   version: '1.0.0',
 *   engine: '^1.0.0',
 *   title: 'Acme Auth',
 *   description: 'Sign-in through the Acme identity provider.',
 * }
 * ```
 *
 * @packageDocumentation
 */
export type { Category } from './contract/category.ts'
export type { Condition } from './contract/condition.ts'
export type { PluginManifest } from './contract/plugin-manifest.ts'
export type { PluginOption } from './contract/plugin-option.ts'
