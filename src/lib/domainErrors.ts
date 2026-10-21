/**
 * A business-rule failure with a message that is safe to show to the operator.
 *
 * Server callables map this class to a failed-precondition response instead of
 * treating it as an internal error. Browser data-layer code treats it like any
 * other Error, so existing form error handling keeps working.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}
