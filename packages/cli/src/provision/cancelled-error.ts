export class CancelledError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "CancelledError";
  }
}
