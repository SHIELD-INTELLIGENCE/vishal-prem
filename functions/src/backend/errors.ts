/**
 * Transport-neutral failure codes for trusted operations.
 *
 * The Firebase callable adapter maps these to HttpsError codes; the Netlify
 * adapter maps them to HTTP statuses. Business-rule failures remain
 * `DomainError` and become `failed-precondition` in both transports.
 */
export type OperationErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'not-found'
  | 'already-exists'
  | 'failed-precondition'
  | 'method-not-allowed'
  | 'unsupported-media-type'
  | 'payload-too-large'
  | 'internal'

export class OperationError extends Error {
  readonly code: OperationErrorCode

  constructor(code: OperationErrorCode, message: string) {
    super(message)
    this.name = 'OperationError'
    this.code = code
  }
}
