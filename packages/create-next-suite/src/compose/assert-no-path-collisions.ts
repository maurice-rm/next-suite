import { findPathCollision } from '../file-system/find-path-collision.ts'
import { ComposeError } from './compose-error.ts'
import type { VirtualFiles } from './virtual-files.ts'

/** Rejects paths that would collide on disk, such as two that differ only in case. */
export const assertNoPathCollisions = (files: VirtualFiles): void => {
  const collision = findPathCollision(files.values())
  if (collision !== undefined) {
    throw new ComposeError(collision)
  }
}
