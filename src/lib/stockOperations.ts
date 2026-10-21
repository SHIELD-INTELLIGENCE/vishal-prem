import { DomainError } from './domainErrors'
import type { Product, StockAdjustment, UserProfile } from '../types/models'

const MAX_STOCK_QUANTITY = 1_000_000

/**
 * Stock quantities may be fractional. Keep arithmetic deterministic without
 * introducing a separate ledger or unit system.
 */
function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

export interface StockAdjustmentResult {
  previousStockQty: number
  resultingStockQty: number
}

/**
 * Applies one signed manual adjustment to a live product balance.
 *
 * The caller must pass a product read inside the same transaction that writes
 * the new balance. Negative resulting stock is rejected because no approved
 * negative-stock policy exists in this application.
 */
export function applyStockAdjustment(
  product: Product,
  delta: number,
): StockAdjustmentResult {
  if (!product.trackStock) {
    throw new DomainError(`Stock is not tracked for "${product.name}".`)
  }
  if (!Number.isFinite(delta) || delta === 0) {
    throw new DomainError('Enter a non-zero stock adjustment quantity.')
  }

  const previousStockQty = product.stockQty
  if (
    typeof previousStockQty !== 'number'
    || !Number.isFinite(previousStockQty)
  ) {
    throw new DomainError(
      `The current stock for "${product.name}" is missing or invalid. Reconcile it before adjusting.`,
    )
  }

  const rawResult = previousStockQty + delta
  if (rawResult < 0) {
    throw new DomainError(
      `This adjustment would make "${product.name}" stock negative (${roundQuantity(rawResult)} ${product.unit}).`,
    )
  }
  const resultingStockQty = roundQuantity(rawResult)
  if (resultingStockQty > MAX_STOCK_QUANTITY) {
    throw new DomainError(
      `This adjustment would take "${product.name}" stock above the supported maximum.`,
    )
  }

  return { previousStockQty, resultingStockQty }
}

export function buildStockAdjustment({
  product,
  profile,
  adjustmentId,
  delta,
  reason,
  previousStockQty,
  resultingStockQty,
  now,
}: {
  product: Product
  profile: UserProfile
  adjustmentId: string
  delta: number
  reason: string
  previousStockQty: number
  resultingStockQty: number
  now: string
}): StockAdjustment {
  return {
    id: adjustmentId,
    productId: product.id,
    productName: product.name,
    departmentId: product.departmentId,
    outletIds: [...product.outletIds],
    unit: product.unit,
    delta: roundQuantity(delta),
    previousStockQty: roundQuantity(previousStockQty),
    resultingStockQty: roundQuantity(resultingStockQty),
    reason: reason.trim(),
    actorName: profile.displayName?.trim() || profile.email || profile.uid,
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    createdBy: profile.uid,
    updatedBy: profile.uid,
  }
}
