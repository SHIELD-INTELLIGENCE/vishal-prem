import { OperationError } from '../backend/errors'

export interface VerifiedFirebaseToken {
  uid: string
}

export type FirebaseTokenVerifier = (
  token: string,
  checkRevoked: boolean,
) => Promise<VerifiedFirebaseToken>

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

/**
 * Verifies a Firebase ID token supplied in the Authorization header. A
 * Netlify request header, client-supplied UID or unverified JWT payload is
 * never treated as authentication.
 */
export async function authenticateRequest(
  request: Request,
  verify: FirebaseTokenVerifier,
): Promise<string> {
  const token = bearerToken(request)
  if (!token) {
    throw new OperationError(
      'unauthenticated',
      'Sign in before making this request.',
    )
  }

  try {
    const decoded = await verify(token, true)
    if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid) {
      throw new Error('Verified token did not contain a UID.')
    }
    return decoded.uid
  } catch (error) {
    if (error instanceof OperationError) throw error
    // Server-side diagnostic only. The raw code is safe to log and tells the
    // operator whether the Admin SDK lacks credentials, the token is expired,
    // or the client/function projects do not match. Never log the token.
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'unknown'
    const name = error instanceof Error ? error.name : typeof error
    const message = error instanceof Error
      ? error.message.slice(0, 300)
      : String(error).slice(0, 300)
    console.warn('[trusted-operation] Firebase token verification failed', { code, name, message })
    // Deliberately do not distinguish an expired token from a forged one in
    // the response: both require the operator to sign in again, and the raw
    // Firebase error can contain implementation details.
    throw new OperationError(
      'unauthenticated',
      'Your session is invalid or has expired. Sign in again.',
    )
  }
}
