import { Writable } from 'node:stream'

/** A stream that keeps what is written to it, and the text written so far. */
export type CollectedOutput = { stream: Writable; text: () => string }

/** Collects what is written to a stream, telling `onWrite` about each chunk as it arrives. */
export const collectOutput = (onWrite: (chunk: string) => void = () => {}): CollectedOutput => {
  const chunks: string[] = []
  const stream = new Writable({
    write: (chunk, _encoding, done) => {
      chunks.push(String(chunk))
      onWrite(String(chunk))
      done()
    },
  })
  return { stream, text: () => chunks.join('') }
}
