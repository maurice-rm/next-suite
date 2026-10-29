/** A project directory that cannot be written. */
export class WriteError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`create-next-suite: ${message}`, options)
    this.name = 'WriteError'
  }
}
