import {
  collection,
  doc,
  increment,
  runTransaction,
  updateDoc,
  type Transaction,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { canTransitionOrder, stockRestoration } from '@/lib/calculations'
import { callTrustedOperation } from '@/lib/functions'
import {
  STOCK_DEDUCTED_STATUSES,
  buildOrder,
} from '@/lib/orderOperations'
import { makeOrderNumber, makeReceiptNumber, nowIso } from '@/lib/utils'
import type {
  Order,
  OrderStatus,
  Outlet,
  Payment,
  Product,
  UserProfile,
} from '@/types/models'
import type { OrderFormValues } from '@/lib/validation'

export interface CreateOrderArgs {
  values: OrderFormValues
  outlet: Outlet
  businessName: string
  pricesIncludeTax: boolean
  profile: UserProfile
  requestId: string
}

export interface CreateOrderResult {
  id: string
  orderNumber: string
}

/**
 * Trusted order creation. The server derives the actor, outlet settings,
 * prices, tax, discounts, totals, and stock snapshots from live documents.
 */
export async function createOrderSecure({
  values,
  requestId,
}: {
  values: OrderFormValues
  requestId: string
}): Promise<CreateOrderResult> {
  return callTrustedOperation<
    { requestId: string; values: OrderFormValues },
    CreateOrderResult
  >('createOrder', { requestId, values })
}

export interface CancelOrderResult {
  id: string
  status: 'cancelled'
  restored: boolean
}

/**
 * Trusted cancellation. The server reads the live order, restores stock from
 * immutable line snapshots, and makes retries idempotent.
 */
export async function cancelOrderSecure({
  orderId,
  expectedStatus,
  reason,
}: {
  orderId: string
  expectedStatus?: OrderStatus
  reason?: string
}): Promise<CancelOrderResult> {
  return callTrustedOperation<
    { orderId: string; expectedStatus?: OrderStatus; reason?: string },
    CancelOrderResult
  >('cancelOrder', { orderId, expectedStatus, reason })
}

export async function createOrder({
  values,
  outlet,
  businessName,
  pricesIncludeTax,
  profile,
  requestId,
}: CreateOrderArgs): Promise<{ id: string; orderNumber: string }> {
  if (!db) throw new Error('Firestore is not available.')
  if (!values.departmentId) throw new Error('Choose a department.')
  if (values.lines.length === 0) throw new Error('Add at least one product.')

  const now = nowIso()
  const orderRef = doc(db, 'orders', requestId)
  const paymentRef = doc(collection(db, 'payments'))
  let result = { id: requestId, orderNumber: '' }

  try {
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(orderRef)
      if (existing.exists()) {
        const data = existing.data() as Order
        result = { id: existing.id, orderNumber: data.orderNumber }
        return
      }

      const productIds = Array.from(new Set(values.lines.map((line) => line.productId)))
      const productSnapshots = await Promise.all(
        productIds.map((productId) => transaction.get(doc(db!, 'products', productId))),
      )
      const productMap = new Map<string, Product>()
      for (const snapshot of productSnapshots) {
        if (snapshot.exists()) {
          productMap.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
        }
      }

      const orderNumber = makeOrderNumber(outlet.code)
      const { order, stockDemand } = buildOrder({
        values,
        outlet,
        pricesIncludeTax,
        profile,
        requestId,
        productMap,
        now,
        orderNumber,
      })

      transaction.set(orderRef, order)

      for (const [productId, quantity] of stockDemand) {
        transaction.update(doc(db!, 'products', productId), {
          stockQty: increment(-quantity),
          updatedAt: now,
          updatedBy: profile.uid,
        })
      }

      if (order.paidPaise > 0) {
        const payment: Payment = {
          id: paymentRef.id,
          receiptNumber: makeReceiptNumber(outlet.code),
          outletId: outlet.id,
          departmentIds: [values.departmentId],
          orderId: orderRef.id,
          customerId: values.customerId || undefined,
          customerName: values.customerName.trim(),
          amountPaise: order.paidPaise,
          type: 'payment',
          mode: values.paymentMode,
          reference: values.paymentReference?.trim() || '',
          receivedAt: now,
          notes: `Advance for ${orderNumber} (${businessName})`,
          createdAt: now,
          updatedAt: now,
          createdBy: profile.uid,
        }
        transaction.set(paymentRef, payment)
      }

      result = { id: orderRef.id, orderNumber }
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }

  return result
}

export async function updateOrderStatus({
  order,
  status,
  profile,
  reason,
}: {
  order: Order
  status: OrderStatus
  profile: UserProfile
  reason?: string
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()

  // Only cancellation has to reverse the stock deduction. Other transitions
  // keep their existing single-document write.
  if (status !== 'cancelled') {
    if (!canTransitionOrder(order.status, status)) {
      throw new Error(`An order cannot move from ${order.status} to ${status}.`)
    }
    await updateDoc(doc(db, 'orders', order.id), {
      status,
      updatedAt: now,
      updatedBy: profile.uid,
    })
    return
  }

  // A caller holding an already-cancelled copy should still reach the
  // transaction, where the live status makes the retry a successful no-op.
  if (order.status !== 'cancelled' && !canTransitionOrder(order.status, 'cancelled')) {
    throw new Error(`An order cannot move from ${order.status} to cancelled.`)
  }

  await runTransaction(db, async (transaction) => {
    // Read the live document rather than trusting the caller's copy. A retry or
    // a second tab sees `cancelled` here and returns without a second stock
    // restoration. Concurrent attempts rely on Firestore's transaction retry
    // after the first commit changes the order document.
    const orderRef = doc(db!, 'orders', order.id)
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists()) throw new Error('This order no longer exists.')

    const current = { ...(snapshot.data() as Order), id: snapshot.id }
    if (current.status === 'cancelled') return
    if (current.status !== order.status) {
      throw new Error('This order changed while you were working. Refresh and try again.')
    }
    if (!canTransitionOrder(current.status, 'cancelled')) {
      throw new Error(`An order cannot move from ${current.status} to cancelled.`)
    }

    // All Firestore reads must finish before the first write. Restoration uses
    // the immutable line snapshots from creation, never the current product
    // metadata. Any missing or corrupt snapshot aborts the whole cancellation.
    const restoration = STOCK_DEDUCTED_STATUSES.includes(current.status)
      ? await stockToRestore(transaction, current)
      : []

    transaction.update(orderRef, {
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: reason?.trim() || 'Cancelled by staff',
      updatedAt: now,
      updatedBy: profile.uid,
    })

    for (const entry of restoration) {
      transaction.update(doc(db!, 'products', entry.productId), {
        stockQty: increment(entry.quantity),
        updatedAt: now,
        updatedBy: profile.uid,
      })
    }
  })
}

/**
 * Reads every product referenced by the order and calculates the stock to
 * return from the order line snapshots. Must be called before any transaction
 * write.
 */
async function stockToRestore(
  transaction: Transaction,
  order: Order,
): Promise<Array<{ productId: string; quantity: number }>> {
  const productIds = Array.from(new Set(order.lines.map((line) => line.productId)))
  const snapshots = await Promise.all(
    productIds.map((productId) => transaction.get(doc(db!, 'products', productId))),
  )

  const products = new Map<string, Product>()
  for (const snapshot of snapshots) {
    if (snapshot.exists()) {
      products.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
    }
  }

  const restoration = stockRestoration(order.lines, products)

  // A tracked product without a numeric stock quantity cannot be restored
  // safely: `increment` would create the field and invent stock. Abort instead.
  for (const entry of restoration) {
    const product = products.get(entry.productId)
    if (
      !product ||
      typeof product.stockQty !== 'number' ||
      !Number.isFinite(product.stockQty)
    ) {
      throw new Error(
        `Cannot restore stock for "${product?.name ?? 'a product'}" because its stock quantity is missing or invalid. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }
  }

  return restoration
}

export async function updateOrderNotes(
  orderId: string,
  notes: string,
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  await updateDoc(doc(db, 'orders', orderId), {
    notes: notes.trim(),
    updatedAt: nowIso(),
    updatedBy: profile.uid,
  })
}

export async function recordOrderPrint({
  orderId,
  docType,
  profile,
}: {
  orderId: string
  docType: 'receipt' | 'kitchen' | 'packing' | 'invoice'
  profile: UserProfile
}): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  await updateDoc(doc(db, 'orders', orderId), {
    [`printCounts.${docType}`]: increment(1),
    updatedAt: nowIso(),
    updatedBy: profile.uid,
  })
}
