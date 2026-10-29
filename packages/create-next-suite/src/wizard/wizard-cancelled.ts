/** Thrown when the user cancels the wizard with Ctrl+C. */
export class WizardCancelled extends Error {
  constructor() {
    super('create-next-suite: cancelled')
    this.name = 'WizardCancelled'
  }
}
