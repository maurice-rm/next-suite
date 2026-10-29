/** A template that breaks the template rules, or fails to render. */
export class TemplateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(`create-next-suite: ${message}`, options)
    this.name = 'TemplateError'
  }
}
