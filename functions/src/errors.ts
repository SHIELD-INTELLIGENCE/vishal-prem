import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/logger'
import { DomainError } from '../../src/lib/domainErrors'
import { OperationError, type OperationErrorCode } from './backend/errors'
import { classifyFirebaseError } from './backend/firebaseErrorMapping'

const HTTPS_CODES: Record<
  OperationErrorCode,
  ConstructorParameters<typeof HttpsError>[0]
> = {
  unauthenticated: 'unauthenticated',
  'permission-denied': 'permission-denied',
  'invalid-argument': 'invalid-argument',
  'not-found': 'not-found',
  'already-exists': 'already-exists',
  'failed-precondition': 'failed-precondition',
  'resource-exhausted': 'resource-exhausted',
  'unavailable': 'unavailable',
  'method-not-allowed': 'invalid-argument',
  'unsupported-media-type': 'invalid-argument',
  'payload-too-large': 'invalid-argument',
  internal: 'internal',
}

/**
 * Converts a transport-neutral failure into a callable-safe response.
 * Unexpected errors are logged server-side and returned as a generic internal
 * error so raw Firestore paths or implementation details never reach the
 * browser.
 */
export function throwHttpsError(error: unknown): never {
  if (error instanceof HttpsError) throw error
  if (error instanceof OperationError) {
    throw new HttpsError(HTTPS_CODES[error.code], error.message)
  }
  if (error instanceof DomainError) {
    throw new HttpsError('failed-precondition', error.message)
  }
  const classified = classifyFirebaseError(error)
  if (classified) {
    logger.error('Classified callable infrastructure error', {
      code: classified.diagnostic?.code,
      source: classified.diagnostic?.source,
      indexUrl: classified.diagnostic?.indexUrl,
    })
    throw new HttpsError(
      HTTPS_CODES[classified.code],
      classified.message,
      classified.diagnostic ? { diagnostic: classified.diagnostic } : undefined,
    )
  }
  logger.error('Unhandled callable error', error)
  throw new HttpsError('internal', 'The request could not be completed.')
}
