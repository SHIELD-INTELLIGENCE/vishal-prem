import { DomainError } from '../../../src/lib/domainErrors'
import type { UserProfile } from '../../../src/types/models'
import { getAdminAuth } from '../admin'
import { requireActorByUid } from '../backend/context'
import { OperationError, type OperationErrorCode } from '../backend/errors'
import { authenticateRequest } from './token'

const MAX_BODY_BYTES = 256 * 1024

const STATUS: Record<OperationErrorCode, number> = {
  unauthenticated: 401,
  'permission-denied': 403,
  'invalid-argument': 400,
  'not-found': 404,
  'already-exists': 409,
  'failed-precondition': 412,
  'method-not-allowed': 405,
  'unsupported-media-type': 415,
  'payload-too-large': 413,
  internal: 500,
}

export interface TrustedEndpointOptions<TInput, TOutput> {
  parse: (body: unknown) => TInput
  run: (profile: UserProfile, input: TInput) => Promise<TOutput>
}

interface CorsResult {
  allowed: boolean
  headers: Headers
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>()
  const explicit = process.env.ALLOWED_APP_ORIGINS ?? ''
  for (const value of explicit.split(',')) {
    const trimmed = value.trim()
    if (!trimmed) continue
    try {
      origins.add(new URL(trimmed).origin)
    } catch {
      // Ignore malformed configuration entries; they cannot match an origin.
    }
  }

  for (const candidate of [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.DEPLOY_URL,
  ]) {
    if (!candidate) continue
    try {
      origins.add(new URL(candidate).origin)
    } catch {
      // Ignore malformed deployment metadata rather than widening CORS.
    }
  }

  return origins
}

function corsFor(request: Request): CorsResult {
  const origin = request.headers.get('origin')
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  })

  // Non-browser callers do not send an Origin header. They still require a
  // valid Firebase ID token and are subject to the same authorization checks.
  if (!origin) return { allowed: true, headers }

  let normalized: string
  try {
    normalized = new URL(origin).origin
  } catch {
    return { allowed: false, headers }
  }

  if (!configuredOrigins().has(normalized)) {
    return { allowed: false, headers }
  }

  headers.set('Access-Control-Allow-Origin', normalized)
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  headers.set('Access-Control-Max-Age', '600')
  return { allowed: true, headers }
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: CorsResult,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers(cors.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(key, value)
  }
  return new Response(JSON.stringify(body), { status, headers })
}

function errorResponse(error: unknown, cors: CorsResult): Response {
  if (error instanceof OperationError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      STATUS[error.code],
      cors,
      error.code === 'method-not-allowed' ? { Allow: 'POST, OPTIONS' } : undefined,
    )
  }
  if (error instanceof DomainError) {
    return jsonResponse(
      { error: { code: 'failed-precondition', message: error.message } },
      STATUS['failed-precondition'],
      cors,
    )
  }

  // Server-side logging is allowed to include the stack. The client receives
  // only a generic message with no Firestore path, token or credential data.
  console.error('Unhandled trusted operation error', error)
  return jsonResponse(
    {
      error: {
        code: 'internal',
        message: 'The request could not be completed.',
      },
    },
    STATUS.internal,
    cors,
  )
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new OperationError(
      'unsupported-media-type',
      'Send the request as application/json.',
    )
  }

  const declaredLength = request.headers.get('content-length')
  if (declaredLength) {
    const parsed = Number(declaredLength)
    if (Number.isFinite(parsed) && parsed > MAX_BODY_BYTES) {
      throw new OperationError('payload-too-large', 'The request is too large.')
    }
  }

  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw new OperationError('payload-too-large', 'The request is too large.')
  }
  if (!text.trim()) {
    throw new OperationError('invalid-argument', 'The request body is empty.')
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new OperationError('invalid-argument', 'The request body is not valid JSON.')
  }
}

/**
 * Shared Netlify request pipeline:
 * method check → CORS check → Firebase ID token verification → live profile
 * load → JSON body validation → trusted operation → safe structured response.
 */
export async function handleTrustedEndpoint<TInput, TOutput>(
  request: Request,
  options: TrustedEndpointOptions<TInput, TOutput>,
): Promise<Response> {
  const cors = corsFor(request)

  try {
    if (!cors.allowed) {
      throw new OperationError(
        'permission-denied',
        'This application origin is not allowed.',
      )
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors.headers })
    }
    if (request.method !== 'POST') {
      throw new OperationError(
        'method-not-allowed',
        'This endpoint accepts POST requests only.',
      )
    }

    const uid = await authenticateRequest(
      request,
      (token, checkRevoked) => getAdminAuth().verifyIdToken(token, checkRevoked),
    )
    const profile = await requireActorByUid(uid)
    const body = await readJsonBody(request)
    const input = options.parse(body)
    const result = await options.run(profile, input)
    return jsonResponse(result, 200, cors)
  } catch (error) {
    return errorResponse(error, cors)
  }
}
