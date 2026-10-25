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

export interface EnableProductStockTrackingArgs {
  requestId: string
  productId: string
  openingStock: number
  criticalStock?: number
  reason: string
}

/**
 * Trusted conversion of an existing untracked product into a stock-tracked
 * product. The opening balance is explicit (zero is allowed) and is written
 * with an immutable audit record. This is the only supported way to change
 * tracking after creation.
 */
export async function enableProductStockTracking({
  requestId,
  productId,
  openingStock,
  criticalStock,
  reason,
}: EnableProductStockTrackingArgs): Promise<AdjustProductStockResult> {
  return callTrustedOperation<EnableProductStockTrackingArgs, AdjustProductStockResult>(
    'enableProductStockTracking',
    { requestId, productId, openingStock, criticalStock, reason },
  )
}
