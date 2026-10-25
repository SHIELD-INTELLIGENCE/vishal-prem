import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({
  requireAuth: () => ({
    currentUser: {
      getIdToken: async () => 'test-token',
    },
  }),
}))

import { callTrustedOperation, TrustedFunctionError } from '@/lib/functions'

function response(body: string, status: number, contentType = 'application/json') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': contentType },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callTrustedOperation transport handling', () => {
  it('turns a Vite HTML 404 into an actionable endpoint-not-found error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('Not Found', 404, 'text/html')))

    await expect(callTrustedOperation('adjustProductStock', {})).rejects.toMatchObject({
      name: 'TrustedFunctionError',
      code: 'endpoint-not-found',
      status: 404,
    })
  })

  it('keeps a structured server error code, message and support reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(JSON.stringify({
      error: {
        code: 'failed-precondition',
        message: 'Stock is not tracked for "Kaju Barfi".',
        reference: 'ERR-ABC12345',
        diagnostic: { source: 'firestore', code: '9' },
      },
    }), 412)))

    await expect(callTrustedOperation('adjustProductStock', {})).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Stock is not tracked for "Kaju Barfi".',
      reference: 'ERR-ABC12345',
      diagnostic: { source: 'firestore', code: '9' },
    })
  })

  it('returns a successful JSON payload unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(JSON.stringify({
      adjustmentId: 'adj-1',
      resultingStockQty: 0,
    }), 200)))

    await expect(callTrustedOperation('adjustProductStock', {})).resolves.toEqual({
      adjustmentId: 'adj-1',
      resultingStockQty: 0,
    })
  })

  it('reports an unreadable success response instead of pretending it succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response('<html>SPA fallback</html>', 200, 'text/html')))

    await expect(callTrustedOperation('adjustProductStock', {})).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })

  it('uses the same endpoint base as the deployed same-origin functions', async () => {
    const fetchMock = vi.fn(async () => response('{}', 200))
    vi.stubGlobal('fetch', fetchMock)

    await callTrustedOperation('labelOperation', { action: 'create' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/label-operation',
      expect.objectContaining({ method: 'POST' }),
    )
    const error = new TrustedFunctionError('internal', 'x', 500)
    expect(error.name).toBe('TrustedFunctionError')
  })
})
