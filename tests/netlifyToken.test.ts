import { describe, expect, it } from 'vitest'
import { OperationError } from '../functions/src/backend/errors'
import { authenticateRequest } from '../functions/src/netlify/token'

function tokenRequest(authorization?: string): Request {
  const headers = new Headers()
  if (authorization) headers.set('Authorization', authorization)
  return new Request('http://localhost/.netlify/functions/create-order', {
    method: 'POST',
    headers,
  })
}

describe('Netlify Firebase token verification', () => {
  it('rejects a missing bearer token without calling the verifier', async () => {
    let called = false
    await expect(
      authenticateRequest(tokenRequest(), async () => {
        called = true
        return { uid: 'someone' }
      }),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(called).toBe(false)
  })

  it('rejects a malformed authorization header', async () => {
    await expect(
      authenticateRequest(tokenRequest('Basic abc'), async () => ({ uid: 'someone' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('calls the verifier with revocation checks and returns only its UID', async () => {
    const calls: Array<{ token: string; checkRevoked: boolean }> = []
    const uid = await authenticateRequest(tokenRequest('Bearer id-token'), async (token, checkRevoked) => {
      calls.push({ token, checkRevoked })
      return { uid: 'verified-actor' }
    })
    expect(uid).toBe('verified-actor')
    expect(calls).toEqual([{ token: 'id-token', checkRevoked: true }])
  })

  it('maps an expired verification failure to a safe unauthenticated error', async () => {
    // Mocked verifier: this proves error mapping and non-disclosure. The
    // emulator suite separately exercises genuine Firebase ID tokens.
    const error = Object.assign(new Error('auth/id-token-expired internal detail'), {
      code: 'auth/id-token-expired',
    })
    await expect(
      authenticateRequest(tokenRequest('Bearer expired-token'), async () => {
        throw error
      }),
    ).rejects.toSatisfy((caught) => (
      caught instanceof OperationError
      && caught.code === 'unauthenticated'
      && !caught.message.includes('internal detail')
    ))
  })

  it('rejects a verified token with no UID', async () => {
    await expect(
      authenticateRequest(tokenRequest('Bearer id-token'), async () => ({ uid: '' })),
    ).rejects.toMatchObject({ code: 'unauthenticated' })
  })
})
