import { Writable } from 'node:stream'

/** A stream that keeps what is written to it, and the text written so far. */
export type CollectedOutput = { stream: Writable; text: () => string }

export const collectOutput = (): CollectedOutput => {
  const chunks: string[] = []
  const stream = new Writable({
    write: (chunk, _encoding, done) => {
      chunks.push(String(chunk))
      done()
    },
  })
  return { stream, text: () => chunks.join('') }
}
