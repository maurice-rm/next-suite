import { Option } from 'commander'

/**
 * The `--trust` option of every command that runs plugins from a source, which trusts the sources
 * it matches for this run only and stores nothing.
 */
export const createTrustOption = (): Option =>
  new Option(
    '--trust <pattern>',
    'run the code of plugins from matching sources, such as "github:acme/*", for this run; repeatable',
  ).argParser((pattern: string, previous: string[] = []) => [...previous, pattern])
