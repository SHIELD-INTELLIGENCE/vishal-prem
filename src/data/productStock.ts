import { callTrustedOperation } from '@/lib/functions'

export interface AdjustProductStockArgs {
  requestId: string
  productId: string
  delta: number
  reason: string
}

export interface AdjustProductStockResult {
  adjustmentId: string
  productId: string
  previousStockQty: number
  resultingStockQty: number
  unit: string
}

/**
 * Trusted manual stock adjustment. The endpoint derives the actor, permission,
 * scope, live balance and audit timestamp on the server.
 */
export async function adjustProductStock({
  requestId,
  productId,
  delta,
  reason,
}: AdjustProductStockArgs): Promise<AdjustProductStockResult> {
  return callTrustedOperation<AdjustProductStockArgs, AdjustProductStockResult>(
    'adjustProductStock',
    { requestId, productId, delta, reason },
  )
}
