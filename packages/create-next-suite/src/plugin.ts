/**
 * The plugin contract of create-next-suite: the types a plugin's manifest, its categories file and
 * its logic module follow. Plugins import types only.
 *
 * @example
 * ```ts
 * import type { PluginManifest } from 'create-next-suite/plugin'
 *
 * const manifest: PluginManifest = {
 *   name: 'acme-auth',
 *   version: '1.0.0',
 *   contract: '^1.0.0',
 *   title: 'Acme Auth',
 *   description: 'Sign-in through the Acme identity provider.',
 * }
 * ```
 *
 * @packageDocumentation
 */
export type {
  CategoriesFile,
  Category,
  CategorySection,
  ListedCategory,
} from './contract/category.ts'
export type { Condition } from './contract/condition.ts'
export type {
  CodeEntry,
  Contributions,
  ModuleExport,
  NamedModuleExport,
  NextStep,
  SectionText,
} from './contract/contributions.ts'
export type { Dependencies } from './contract/dependencies.ts'
export type { Logic, LogicContext, LogicResult, LogicResultFile } from './contract/logic.ts'
export type { ConflictStrategy, FileRoot, PluginFile } from './contract/plugin-file.ts'
export type {
  ConditionalContributions,
  ConditionalDependencies,
  EnvVariable,
  PackageManagerAdapter,
  PluginManifest,
  PluginRule,
} from './contract/plugin-manifest.ts'
export type { OptionChoice, PluginOption } from './contract/plugin-option.ts'
export type { PostStep } from './contract/post-step.ts'
