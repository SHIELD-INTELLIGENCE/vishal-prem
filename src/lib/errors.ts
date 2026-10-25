import { FirebaseError } from 'firebase/app'

export function rawErrorCode(error: unknown): string {
  if (error instanceof FirebaseError) return error.code
  if (error instanceof Error && 'code' in error) return String((error as { code: unknown }).code)
  return ''
}

export function errorCode(error: unknown): string {
  return rawErrorCode(error)
}

function normalizedCode(code: string): string {
  for (const prefix of ['functions/', 'firestore/', 'firebase/', 'auth/', 'storage/']) {
    if (code.startsWith(prefix)) return code.slice(prefix.length)
  }
  return code
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return ''
}

function indexUrlFrom(message: string): string | undefined {
  const match = message.match(/https?:\/\/[^\s"'<>]+/i)
  return match?.[0]
}

function looksLikeIndexError(message: string): boolean {
  return /requires? an index|missing index|composite index|create_composite_index|index creation/i.test(message)
}

interface TrustedLikeError extends Error {
  code: string
  status?: number
  reference?: string
  diagnostic?: {
    source?: string
    code?: string
    indexUrl?: string
  }
}

function isTrustedFunctionError(error: unknown): error is TrustedLikeError {
  return error instanceof Error
    && error.name === 'TrustedFunctionError'
    && typeof (error as { code?: unknown }).code === 'string'
}

export interface FirebaseErrorDetails {
  rawCode: string
  code: string
  message: string
  indexUrl?: string
  isIndexError: boolean
  isConfigurationError: boolean
  reference?: string
  diagnostic?: TrustedLikeError['diagnostic']
}

/**
 * Extracts the useful, non-secret parts of a Firebase or trusted-function
 * failure. This is used for developer diagnostics and for choosing an accurate
 * operator-facing message. It never reads document data or credentials.
 */
export function describeFirebaseError(error: unknown): FirebaseErrorDetails {
  const rawCode = rawErrorCode(error)
  const code = normalizedCode(rawCode)
  const message = errorMessage(error)
  const trusted = isTrustedFunctionError(error) ? error : null
  const diagnostic = trusted?.diagnostic
  const indexUrl = diagnostic?.indexUrl ?? indexUrlFrom(message)
  const isConfigurationError = (
    (error instanceof Error && error.name === 'FirebaseUnavailableError')
    || /Firebase is not configured/i.test(message)
  )

  return {
    rawCode,
    code,
    message,
    indexUrl,
    isIndexError: code === 'failed-precondition' && (looksLikeIndexError(message) || Boolean(indexUrl)),
    isConfigurationError,
    reference: trusted?.reference,
    diagnostic,
  }
}

function withDevDiagnostic(message: string, details: FirebaseErrorDetails): string {
  if (!import.meta.env.DEV) return message
  const parts: string[] = []
  if (details.rawCode) parts.push(`code ${details.rawCode}`)
  else if (details.code) parts.push(`code ${details.code}`)
  if (details.indexUrl) parts.push(`index ${details.indexUrl}`)
  if (details.reference) parts.push(`ref ${details.reference}`)
  return parts.length > 0 ? `${message} [dev: ${parts.join(' · ')}]` : message
}

function internalMessage(details: FirebaseErrorDetails): string {
  const base = 'The server could not complete that request. Try again in a moment.'
  return details.reference ? `${base} Reference: ${details.reference}.` : base
}

export function isPermissionDenied(error: unknown): boolean {
  const code = normalizedCode(errorCode(error))
  return code === 'permission-denied' || code === 'unauthorized'
}

export function isOfflineError(error: unknown): boolean {
  return ['unavailable', 'network-request-failed'].includes(normalizedCode(errorCode(error)))
}

export function isAlreadyExists(error: unknown): boolean {
  return normalizedCode(errorCode(error)) === 'already-exists'
}

export function friendlyFirebaseError(error: unknown): string {
  const details = describeFirebaseError(error)
  const { rawCode, code } = details

  if (import.meta.env.DEV) {
    // Dev-only diagnostics: the Firebase code, safe message and any index URL
    // are logged. Never log document contents, credentials, tokens or personal
    // data; `String(error)` on a non-Error value yields a plain placeholder.
    console.error('[firebase]', {
      rawCode,
      code,
      message: details.message,
      indexUrl: details.indexUrl,
      reference: details.reference,
      diagnostic: details.diagnostic,
    })
  }

  if (details.isConfigurationError) {
    return withDevDiagnostic(
      details.message || 'Firebase is not configured. Add the VITE_FIREBASE_* variables to .env.local.',
      details,
    )
  }

  // Trusted Netlify operations return operator-safe domain messages. Preserve
  // those instead of replacing a precise stock/permission failure with the
  // generic message for the same HTTP-style code.
  if (isTrustedFunctionError(error)) {
    if (code === 'endpoint-not-found' || code === 'invalid-response') {
      return withDevDiagnostic(error.message, details)
    }
    if (code === 'internal') {
      return withDevDiagnostic(internalMessage(details), details)
    }
    if (error.message) return withDevDiagnostic(error.message, details)
  }

  if (rawCode.startsWith('functions/')) {
    if (code === 'internal') {
      return withDevDiagnostic(internalMessage(details), details)
    }
    if (details.message) return withDevDiagnostic(details.message, details)
  }

  switch (code) {
    case 'unauthenticated':
      return 'Your session has expired. Sign in again.'
    case 'invalid-credential':
    case 'wrong-password':
    case 'user-not-found':
      return 'The email or password is incorrect.'
    case 'invalid-email':
      return 'Enter a valid email address.'
    case 'user-disabled':
      return 'This account has been disabled. Contact your Super Admin.'
    case 'too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'network-request-failed':
      return 'Network unavailable. Check your connection and try again.'
    case 'email-already-in-use':
      return 'An account with this email already exists.'
    case 'weak-password':
      return 'Use a password with at least 8 characters.'
    case 'expired-action-code':
    case 'invalid-action-code':
      return 'This reset link has expired or already been used.'
    case 'requires-recent-login':
    case 'user-token-expired':
      return 'Please sign in again before making this change.'
    case 'operation-not-allowed':
      return 'This sign-in method is not enabled for the project. Contact your administrator.'
    case 'missing-email':
      return 'Enter the email address for the account.'
    case 'permission-denied':
    case 'unauthorized':
      return 'Your account does not have permission to read or change this data. Ask an administrator to check your outlet and department scope.'
    case 'unavailable':
    case 'deadline-exceeded':
    case 'cancelled':
      return 'The service is unreachable. Check your connection and try again.'
    case 'failed-precondition':
      if (details.isIndexError) {
        return withDevDiagnostic(
          'This information is not ready yet. The database needs a one-time Firestore index. '
          + 'An administrator must deploy the indexes and wait for them to finish building before this screen can load.',
          details,
        )
      }
      return withDevDiagnostic(
        'The database rejected this request because the stored data is not in the required state. '
        + 'Reload and try again; if it continues, ask an administrator to check the configuration.',
        details,
      )
    case 'resource-exhausted':
      return 'A quota was exceeded. Try again later.'
    case 'already-exists':
      return 'This record already exists.'
    case 'not-found':
      return 'This record no longer exists.'
    case 'invalid-argument':
      return 'Some submitted values are invalid. Review the form and try again.'
    case 'aborted':
      return 'The record changed while you were saving. Reload and try again.'
    case 'canceled':
      return 'The upload was cancelled.'
    case 'retry-limit-exceeded':
      return 'The upload timed out. Try a smaller image.'
    case 'internal':
    case 'unknown':
    case 'data-loss':
      return withDevDiagnostic(internalMessage(details), details)
    default:
      if (error instanceof FirebaseError) {
        return withDevDiagnostic(
          'That request could not be completed. Check the details and try again.',
          details,
        )
      }
      if (details.message) return withDevDiagnostic(details.message, details)
      return 'Something went wrong. Please try again.'
  }
}
