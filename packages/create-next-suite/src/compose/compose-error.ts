/** Plugins whose contributions cannot be combined into one project, or an unsafe target path. */
export class ComposeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`create-next-suite: ${message}`, options)
    this.name = 'ComposeError'
  }
}
