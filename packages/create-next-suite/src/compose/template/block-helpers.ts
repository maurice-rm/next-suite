/**
 * The Handlebars block helpers templates may use; the template environment removes every other one.
 */
export const BLOCK_HELPERS = ['if', 'unless', 'each'] as const

export type BlockHelper = (typeof BLOCK_HELPERS)[number]

/** The helper a condition asks a named fact through, such as `(has "plugin:prettier")`. */
export const FACT_HELPER = 'has'

/** Plugin templates may use every block; files of the base project may not branch. */
export const PLUGIN_TEMPLATE_BLOCKS: readonly BlockHelper[] = [...BLOCK_HELPERS]
export const BASE_TEMPLATE_BLOCKS: readonly BlockHelper[] = ['each']
