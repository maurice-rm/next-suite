import { ExpectedError } from '../../expected-error.ts'

/** A template that breaks the template rules, or fails to render. */
export class TemplateError extends ExpectedError {
  override name = 'TemplateError'
}
