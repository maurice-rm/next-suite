import type { Readable, Writable } from 'node:stream'

/** Where prompts read keys and render to; the terminal in the CLI, streams in tests. */
export type Streams = { input: Readable; output: Writable }
