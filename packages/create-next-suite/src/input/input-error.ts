/** Answers that cannot be used: an unknown key, a wrong value, a missing answer, an incompatibility. */
export class InputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`create-next-suite: ${message}`, options)
    this.name = 'InputError'
  }
}
