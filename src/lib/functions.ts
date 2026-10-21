import { requireAuth } from './firebase'

export type TrustedOperation =
  | 'createOrder'
  | 'cancelOrder'
  | 'recordOrderPayment'
  | 'recordBookingPayment'
  | 'adjustProductStock'
  | 'productionOperation'
  | 'inventoryOperation'
  | 'deliveryOperation'
  | 'financeOperation'
  | 'staffDirectory'
  | 'updateBooking'
  | 'createBooking'

const ENDPOINTS: Record<TrustedOperation, string> = {
  createOrder: 'create-order',
  cancelOrder: 'cancel-order',
  recordOrderPayment: 'record-order-payment',
  recordBookingPayment: 'record-booking-payment',
  adjustProductStock: 'adjust-product-stock',
  productionOperation: 'production-operation',
  inventoryOperation: 'inventory-operation',
  deliveryOperation: 'delivery-operation',
  financeOperation: 'finance-operation',
  staffDirectory: 'staff-directory',
  updateBooking: 'update-booking',
  createBooking: 'create-booking',
}

function endpointBase(): string {
  const configured = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined
  const base = configured?.trim() || '/.netlify/functions'
  return base.replace(/\/+$/, '')
}

export class TrustedFunctionError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'TrustedFunctionError'
    this.code = code
    this.status = status
  }
}

/**
 * Calls one Netlify-hosted trusted operation with the current Firebase ID
 * token. The browser never supplies an actor id, role, balance or timestamp;
 * those are derived from the verified token and live Firestore documents.
 */
export async function callTrustedOperation<TInput, TOutput>(
  operation: TrustedOperation,
  input: TInput,
): Promise<TOutput> {
  const auth = requireAuth()
  const user = auth.currentUser
  if (!user) {
    throw new TrustedFunctionError(
      'unauthenticated',
      'Sign in before making this request.',
      401,
    )
  }

  let token: string
  try {
    token = await user.getIdToken()
  } catch {
    throw new TrustedFunctionError(
      'unauthenticated',
      'Your session could not be verified. Sign in again.',
      401,
    )
  }

  let response: Response
  try {
    response = await fetch(`${endpointBase()}/${ENDPOINTS[operation]}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new TrustedFunctionError(
      'unavailable',
      'The service is unreachable. Check your connection and try again.',
      0,
    )
  }

  const text = await response.text().catch(() => '')
  let payload: unknown
  if (text) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      payload = undefined
    }
  }

  if (!response.ok) {
    const structured = payload as
      | { error?: { code?: unknown; message?: unknown } }
      | undefined
    const code = typeof structured?.error?.code === 'string'
      ? structured.error.code
      : 'internal'
    const message = typeof structured?.error?.message === 'string'
      ? structured.error.message
      : 'The request could not be completed.'
    throw new TrustedFunctionError(code, message, response.status)
  }

  if (payload === undefined) {
    throw new TrustedFunctionError(
      'internal',
      'The server returned an unreadable response.',
      response.status,
    )
  }

  return payload as TOutput
}
