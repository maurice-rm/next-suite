const TARGET_ACTIONS = ['create', 'empty', 'overwrite'] as const

/**
 * What a run does with a target folder that already has files: `create` writes into a missing or
 * empty one, `empty` deletes everything but `.git` first, `overwrite` keeps the existing files and
 * writes the generated ones over them.
 */
export type TargetAction = (typeof TARGET_ACTIONS)[number]

export const isTargetAction = (value: unknown): value is TargetAction =>
  TARGET_ACTIONS.some((action) => action === value)
