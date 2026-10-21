import {
  applyStockAdjustment,
  buildStockAdjustment,
} from '../../../src/lib/stockOperations'
import type { Product, StockAdjustment, UserProfile } from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { serverNow } from '../utils'
import {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './context'
import { OperationError } from './errors'
import type { AdjustProductStockInput } from './validation'

export interface AdjustProductStockResult {
  adjustmentId: string
  productId: string
  previousStockQty: number
  resultingStockQty: number
  unit: string
}

/**
 * Applies one signed manual stock adjustment to the live product balance and
 * writes an immutable audit record in the same transaction.
 *
 * The request id is the audit-record id. A repeated request with the same
 * intent returns the original result; reusing it for a different adjustment is
 * rejected instead of silently changing the balance twice.
 */
export async function adjustProductStockForActor(
  profile: UserProfile,
  input: AdjustProductStockInput,
): Promise<AdjustProductStockResult> {
  requirePermission(profile, 'inventoryAdjust')
  const reason = input.reason.trim()

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const adjustmentRef = db.collection('stockAdjustments').doc(input.requestId)
    const productRef = db.collection('products').doc(input.productId)
    const [adjustmentSnapshot, productSnapshot] = await transaction.getAll(
      adjustmentRef,
      productRef,
    )

    if (adjustmentSnapshot.exists) {
      const existing = adjustmentSnapshot.data() as StockAdjustment
      if (
        existing.productId === input.productId
        && existing.createdBy === profile.uid
        && existing.delta === input.delta
        && existing.reason === reason
      ) {
        return {
          adjustmentId: adjustmentSnapshot.id,
          productId: existing.productId,
          previousStockQty: existing.previousStockQty,
          resultingStockQty: existing.resultingStockQty,
          unit: existing.unit,
        }
      }
      throw new OperationError(
        'already-exists',
        'That request identifier is already in use by another stock adjustment.',
      )
    }

    if (!productSnapshot.exists) {
      throw new OperationError('not-found', 'This product no longer exists.')
    }

    const product = { ...(productSnapshot.data() as Product), id: productSnapshot.id }
    if (!Array.isArray(product.outletIds) || product.outletIds.length === 0) {
      throw new OperationError(
        'failed-precondition',
        'This product has no outlet assignment. Reconcile it before adjusting stock.',
      )
    }

    // Stock is held on the product, not per outlet. Requiring every assigned
    // outlet keeps one scoped manager from changing stock that also serves an
    // outlet outside their authority.
    for (const outletId of product.outletIds) {
      requireOutletScope(profile, outletId)
    }
    requireDepartmentScope(profile, product.departmentId)

    const result = applyStockAdjustment(product, input.delta)
    const now = serverNow()
    const record = buildStockAdjustment({
      product,
      profile,
      adjustmentId: adjustmentRef.id,
      delta: input.delta,
      reason,
      previousStockQty: result.previousStockQty,
      resultingStockQty: result.resultingStockQty,
      now,
    })

    transaction.update(productRef, {
      stockQty: result.resultingStockQty,
      updatedAt: now,
      updatedBy: profile.uid,
    })
    transaction.set(adjustmentRef, record)

    return {
      adjustmentId: adjustmentRef.id,
      productId: product.id,
      previousStockQty: result.previousStockQty,
      resultingStockQty: result.resultingStockQty,
      unit: product.unit,
    }
  })
}
