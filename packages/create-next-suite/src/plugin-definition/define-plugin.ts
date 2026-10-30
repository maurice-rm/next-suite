import type { UsesShape } from './plugin-context.ts'
import type { Plugin, PluginDefinition } from './plugin-definition.ts'
import type { CheckedOptions } from './plugin-option.ts'

type NoUses = Readonly<Record<never, never>>
type NoOptions = Readonly<Record<never, never>>

/**
 * Declares a plugin: what it is, the points it uses and provides, and what it adds to the
 * project. Every field but the metadata is written as its value or as a function of the context;
 * the context holds the value of each used point and the answers, each narrowed to its option.
 * The metadata (`name`, `title`, `description`, `category`, `section`, `options`, `uses`,
 * `provides` and `collects` by name, `replaces`, `conflicts`) are fixed values, so the core can
 * read them without running the plugin.
 *
 * @typeParam Uses - The points the plugin uses, inferred from `uses`.
 * @typeParam Options - The plugin's options, inferred from `options`.
 * @param definition - The plugin.
 * @returns The plugin as the core runs it.
 *
 * @example
 * ```ts
 * export default definePlugin({
 *   name: 'next-themes',
 *   title: 'next-themes',
 *   category: 'theming',
 *   options: {
 *     defaultTheme: {
 *       question: 'Which theme does a first visit get?',
 *       choices: ['system', 'light', 'dark'],
 *       default: 'system',
 *     },
 *   },
 *   dependencies: { 'next-themes': '0.4.6' },
 *   files: { '@/components/theme-provider.tsx': 'files/theme-provider.tsx' },
 *   layout: ({ options }) => ({
 *     imports: [{ names: ['ThemeProvider'], from: '@/components/theme-provider' }],
 *     wrapChildren: {
 *       component: 'ThemeProvider',
 *       props: { attribute: 'class', defaultTheme: options.defaultTheme },
 *     },
 *     htmlAttributes: { suppressHydrationWarning: true },
 *   }),
 * })
 * ```
 */
export const definePlugin = <
  const Uses extends UsesShape = NoUses,
  const Options extends CheckedOptions<Options> = NoOptions,
>(
  definition: PluginDefinition<Uses, Options>,
): Plugin =>
  // The context types are erased: the core builds each context from `uses` at run time.
  definition as unknown as Plugin
