/** What a precondition gets: the plugins the run selects. */
export type PreconditionContext = {
  /** Whether a plugin of that name is selected. */
  has: (pluginName: string) => boolean
  /** Whether a plugin of that category is selected, such as `linter`. */
  hasCategory: (category: string) => boolean
}

/**
 * What a plugin needs from the rest of the selection, asked before the run: `true` when it is
 * met, otherwise the reason, such as `'it needs a linter or a formatter'`.
 */
export type Precondition = (context: PreconditionContext) => true | string

/** A plugin of the selection: its name and its category, none for an extra. */
type SelectedPlugin = { readonly name: string; readonly category?: string | undefined }

/**
 * The reason a precondition gives for a selection, or nothing when it is met or there is none.
 *
 * @param precondition - The plugin's precondition, if it has one.
 * @param selection - The plugins the run selects.
 */
export const findUnmetPrecondition = (
  precondition: Precondition | undefined,
  selection: readonly SelectedPlugin[],
): string | undefined => {
  const result =
    precondition?.({
      has: (pluginName) => selection.some((plugin) => plugin.name === pluginName),
      hasCategory: (category) => selection.some((plugin) => plugin.category === category),
    }) ?? true
  return result === true ? undefined : result
}
