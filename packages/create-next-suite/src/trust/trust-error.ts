/** A plugin source that is not trusted, or a user configuration that cannot be read. */
export class TrustError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`create-next-suite: ${message}`, options)
    this.name = 'TrustError'
  }
}
