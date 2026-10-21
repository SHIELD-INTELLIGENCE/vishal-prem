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
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code
}

export function isPermissionDenied(error: unknown): boolean {
  const code = normalizedCode(errorCode(error))
  return code === 'permission-denied' || code === 'storage/unauthorized'
}

export function isOfflineError(error: unknown): boolean {
  return ['unavailable', 'network-request-failed', 'failed-precondition'].includes(errorCode(error))
}

export function isAlreadyExists(error: unknown): boolean {
  return normalizedCode(errorCode(error)) === 'already-exists'
}

export function friendlyFirebaseError(error: unknown): string {
  const raw = errorCode(error)
  const code = normalizedCode(raw)
  if (import.meta.env.DEV) {
    // Dev-only diagnostics: log the Firebase error code and its original message
    // (for Firestore this includes the index-creation URL). Never log document
    // contents, credentials, tokens or personal data; `String(error)` on a
    // non-Error value yields a plain placeholder, not an object dump.
    const message = error instanceof Error ? error.message : String(error)
    console.error('[firebase]', raw, message)
  }
  if (raw.startsWith('functions/')) {
    if (code === 'internal') {
      return 'The server could not complete that request. Try again in a moment.'
    }
    if (error instanceof Error && error.message) return error.message
  }
  // Trusted Netlify operations return operator-safe domain messages. Preserve
  // those instead of replacing a precise stock/permission failure with the
  // generic message for the same HTTP-style code.
  if (
    error instanceof Error
    && error.name === 'TrustedFunctionError'
    && 'code' in error
  ) {
    if (code === 'internal') {
      return 'The server could not complete that request. Try again in a moment.'
    }
    if (error.message) return error.message
  }
  switch (code) {
    case 'unauthenticated':
      return 'Your session has expired. Sign in again.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.'
    case 'auth/invalid-email':
      return 'Enter a valid email address.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your Super Admin.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'auth/network-request-failed':
      return 'Network unavailable. Check your connection and try again.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.'
    case 'auth/weak-password':
      return 'Use a password with at least 8 characters.'
    case 'auth/expired-action-code':
    case 'auth/invalid-action-code':
      return 'This reset link has expired or already been used.'
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return 'Please sign in again before making this change.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled for the project. Contact your administrator.'
    case 'auth/missing-email':
      return 'Enter the email address for the account.'
    case 'permission-denied':
    case 'storage/unauthorized':
      return 'You do not have permission to perform this action.'
    case 'unavailable':
    case 'network-request-failed':
      return 'The service is unreachable. Check your connection and try again.'
    case 'failed-precondition':
      return 'This information is not ready yet. The database is missing a one-time setup step (an index) or a required configuration. If you are the administrator, deploy the Firestore indexes; otherwise ask your administrator and try again in a few minutes.'
    case 'already-exists':
      return 'This record already exists.'
    case 'not-found':
      return 'This record no longer exists.'
    case 'storage/canceled':
      return 'The upload was cancelled.'
    case 'storage/retry-limit-exceeded':
      return 'The upload timed out. Try a smaller image.'
    case 'resource-exhausted':
      return 'A quota was exceeded. Try again later.'
    case 'invalid-argument':
      return 'Some submitted values are invalid. Review the form and try again.'
    default:
      if (error instanceof FirebaseError) return 'That request could not be completed. Check the details and try again.'
      if (error instanceof Error && error.message) return error.message
      return 'Something went wrong. Please try again.'
  }
}
