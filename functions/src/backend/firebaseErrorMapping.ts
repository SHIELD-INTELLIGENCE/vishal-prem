import type { OperationErrorCode } from './errors'

/**
 * A safe, transport-neutral classification of an infrastructure failure.
 *
 * `diagnostic` is intended for server logs and developer tooling. It never
 * contains credentials, tokens or document contents; Firestore index errors
 * are the main case where the raw message carries an actionable index URL.
 */
export interface ClassifiedFirebaseError {
  code: OperationErrorCode
  message: string
  diagnostic?: {
    source: 'firestore' | 'firebase'
    code: string
    indexUrl?: string
  }
}

const GRPC_CODES: Record<number, string> = {
  1: 'cancelled',
  2: 'unknown',
  3: 'invalid-argument',
  4: 'deadline-exceeded',
  5: 'not-found',
  6: 'already-exists',
  7: 'permission-denied',
  8: 'resource-exhausted',
  9: 'failed-precondition',
  10: 'aborted',
  11: 'out-of-range',
  12: 'unimplemented',
  13: 'internal',
  14: 'unavailable',
  15: 'data-loss',
  16: 'unauthenticated',
}

function rawCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return ''
  const value = (error as { code: unknown }).code
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  return ''
}

function rawMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const candidate = error as { message?: unknown; details?: unknown }
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message
  }
  if (typeof candidate.details === 'string' && candidate.details.trim()) {
    return candidate.details
  }
  return ''
}

function normalizeCode(code: string): string {
  const trimmed = code.trim()
  if (!trimmed) return ''
  if (/^\d+$/.test(trimmed)) return GRPC_CODES[Number(trimmed)] ?? trimmed
  for (const prefix of ['firestore/', 'firebase/', 'functions/', 'auth/', 'storage/']) {
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length)
  }
  return trimmed
}

function indexUrl(message: string): string | undefined {
  const match = message.match(/https?:\/\/[^\s"'<>]+/i)
  return match?.[0]
}

function looksLikeIndexError(message: string): boolean {
  return /requires? an index|missing index|composite index|create_composite_index|index creation/i.test(message)
}

/**
 * Maps Firebase/Google infrastructure errors to the same stable operation
 * codes used by the Netlify and callable transports. Unknown application
 * errors return null so the caller can keep its existing internal-error path.
 */
export function classifyFirebaseError(
  error: unknown,
): ClassifiedFirebaseError | null {
  const diagnosticCode = rawCode(error)
  const code = normalizeCode(diagnosticCode)
  if (!code) return null

  const message = rawMessage(error)
  const source: 'firestore' | 'firebase' = /^(firestore|firebase)\//.test(diagnosticCode)
    ? 'firestore'
    : 'firebase'

  switch (code) {
    case 'failed-precondition': {
      const url = indexUrl(message)
      if (looksLikeIndexError(message) || url) {
        return {
          code: 'failed-precondition',
          message:
            'This data needs a one-time Firestore index before it can load. '
            + 'An administrator must deploy the indexes and wait for them to finish building.',
          diagnostic: { source, code: diagnosticCode, indexUrl: url },
        }
      }
      return {
        code: 'failed-precondition',
        message:
          'The database rejected this request because the stored data is not in the required state. '
          + 'Reload and try again; if it continues, ask an administrator to check the configuration.',
        diagnostic: { source, code: diagnosticCode },
      }
    }
    case 'permission-denied':
      return {
        code: 'permission-denied',
        message:
          'Your account does not have permission to read or change this data. '
          + 'Ask an administrator to check your outlet and department scope.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'unauthenticated':
      return {
        code: 'unauthenticated',
        message: 'Your session is invalid or has expired. Sign in again.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'unavailable':
    case 'deadline-exceeded':
    case 'cancelled':
      return {
        code: 'unavailable',
        message: 'The database is temporarily unreachable. Check the connection and try again.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'resource-exhausted':
      return {
        code: 'resource-exhausted',
        message: 'A database quota was exceeded. Try again later.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'invalid-argument':
    case 'out-of-range':
      return {
        code: 'invalid-argument',
        message: 'The database rejected the request as invalid.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'not-found':
      return {
        code: 'not-found',
        message: 'The requested record no longer exists.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'already-exists':
      return {
        code: 'already-exists',
        message: 'This record already exists.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'aborted':
      return {
        code: 'failed-precondition',
        message: 'The record changed while this request was running. Reload and try again.',
        diagnostic: { source, code: diagnosticCode },
      }
    case 'internal':
    case 'unknown':
    case 'data-loss':
    case 'unimplemented':
      return {
        code: 'internal',
        message: 'The server could not complete that request. Try again in a moment.',
        diagnostic: { source, code: diagnosticCode },
      }
    default:
      return null
  }
}
