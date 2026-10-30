import { join } from 'node:path'

import type { RemoteEnvironment } from '../loader/remote/remote-source.ts'

/** Responses by URL; every other URL answers 404. */
export type Routes = Readonly<Record<string, () => Response>>

const NOT_FOUND = 404

/** A commit id in the format GitHub and GitLab answer, for routes that resolve a ref. */
export const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567'

/**
 * A remote environment without network: fixed routes, a cache directory below `root`, no tokens.
 */
export const stubRemote = (root: string, routes: Routes = {}): RemoteEnvironment => ({
  fetch: async (input) =>
    routes[String(input)]?.() ?? new Response('not found', { status: NOT_FOUND }),
  cacheDir: join(root, 'cache'),
  tokenFor: () => undefined,
  npmRegistry: undefined,
})
