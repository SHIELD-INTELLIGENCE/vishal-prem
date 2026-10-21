import { FieldValue, type Transaction } from 'firebase-admin/firestore'
import { canTransitionOrder, stockRestoration } from '../../../src/lib/calculations'
import { DomainError } from '../../../src/lib/domainErrors'
import {
  STOCK_DEDUCTED_STATUSES,
  buildOrder,
} from '../../../src/lib/orderOperations'
import { buildOrderPayment } from '../../../src/lib/paymentOperations'
import type {
  Business,
  Department,
  Order,
  Outlet,
  Product,
  UserProfile,
} from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { makeOrderNumber, makeReceiptNumber, serverNow } from '../utils'
import {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './context'
import { OperationError } from './errors'
import type { CancelOrderInput, CreateOrderInput } from './validation'

export interface CreateOrderResult {
  id: string
  orderNumber: string
}

export interface CancelOrderResult {
  id: string
  status: 'cancelled'
  restored: boolean
}

function productDocumentId(productId: string): void {
  if (!productId || productId.includes('/') || productId.length > 128) {
    throw new OperationError(
      'invalid-argument',
      'A selected product identifier is invalid.',
    )
  }
}

/**
 * Creates an order from live catalogue, outlet and business documents.
 *
 * The caller must supply a profile resolved from verified authentication. All
 * reads happen before the first transaction write so prices, tax, stock and
 * line snapshots cannot be forged by the client.
 */
export async function createOrderForActor(
  profile: UserProfile,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  requirePermission(profile, 'ordersManage')

  const db = getAdminDb()
  const values = input.values
  requireOutletScope(profile, values.outletId)
  requireDepartmentScope(profile, values.departmentId)
  if (values.advanceAmount > 0) requirePermission(profile, 'paymentsManage')
  for (const line of values.lines) productDocumentId(line.productId)

  return db.runTransaction(async (transaction) => {
    const orderRef = db.collection('orders').doc(input.requestId)
    const existing = await transaction.get(orderRef)
    if (existing.exists) {
      const data = existing.data() as Order
      if (data.createdBy !== profile.uid) {
        throw new OperationError(
          'already-exists',
          'That request identifier is already in use.',
        )
      }
      return { id: existing.id, orderNumber: data.orderNumber }
    }

    const outletRef = db.collection('outlets').doc(values.outletId)
    const businessRef = db.collection('business').doc('main')
    const departmentRef = db.collection('departments').doc(values.departmentId)
    const productRefs = Array.from(
      new Set(values.lines.map((line) => line.productId)),
      (productId) => db.collection('products').doc(productId),
    )

    // Every read in a Firestore transaction must finish before the first
    // write. Product snapshots are read here so prices, tax, stock and order
    // line snapshots all come from live server-side documents.
    const snapshots = await transaction.getAll(
      outletRef,
      businessRef,
      departmentRef,
      ...productRefs,
    )
    const [outletSnapshot, businessSnapshot, departmentSnapshot, ...productSnapshots] =
      snapshots

    if (!outletSnapshot.exists) {
      throw new OperationError(
        'failed-precondition',
        'The selected outlet no longer exists.',
      )
    }
    if (!businessSnapshot.exists) {
      throw new OperationError(
        'failed-precondition',
        'Business settings are not configured.',
      )
    }
    if (!departmentSnapshot.exists) {
      throw new OperationError(
        'failed-precondition',
        'The selected department no longer exists.',
      )
    }

    const outlet = { ...(outletSnapshot.data() as Outlet), id: outletSnapshot.id }
    const business = businessSnapshot.data() as Business
    const department = {
      ...(departmentSnapshot.data() as Department),
      id: departmentSnapshot.id,
    }

    if (typeof outlet.code !== 'string' || !outlet.code.trim()) {
      throw new OperationError(
        'failed-precondition',
        'The selected outlet has no code.',
      )
    }
    if (!Array.isArray(department.outletIds) || !department.outletIds.includes(outlet.id)) {
      throw new OperationError(
        'failed-precondition',
        'The selected department does not belong to this outlet.',
      )
    }

    const productMap = new Map<string, Product>()
    for (const snapshot of productSnapshots) {
      if (snapshot.exists) {
        productMap.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
      }
    }

    const now = serverNow()
    const orderNumber = makeOrderNumber(outlet.code)
    const { order, stockDemand } = buildOrder({
      values,
      outlet,
      pricesIncludeTax: Boolean(business.pricesIncludeTax),
      profile,
      requestId: input.requestId,
      productMap,
      now,
      orderNumber,
    })

    const advancePaymentRef = order.paidPaise > 0
      ? db.collection('payments').doc(`advance-${input.requestId}`)
      : null
    if (advancePaymentRef) {
      const existingPayment = await transaction.get(advancePaymentRef)
      if (existingPayment.exists) {
        throw new OperationError(
          'already-exists',
          'That request identifier is already in use by a payment.',
        )
      }
    }

    transaction.set(orderRef, order)

    for (const [productId, quantity] of stockDemand) {
      transaction.update(db.collection('products').doc(productId), {
        stockQty: FieldValue.increment(-quantity),
        updatedAt: now,
        updatedBy: profile.uid,
      })
    }

    if (advancePaymentRef) {
      const payment = buildOrderPayment({
        order,
        outlet,
        profile,
        paymentId: advancePaymentRef.id,
        receiptNumber: makeReceiptNumber(outlet.code),
        amountPaise: order.paidPaise,
        type: 'payment',
        mode: values.paymentMode,
        reference: values.paymentReference,
        receivedAt: now,
        notes: `Advance for ${orderNumber} (${business.name ?? ''})`,
        now,
      })
      transaction.set(advancePaymentRef, payment)
    }

    return { id: orderRef.id, orderNumber }
  })
}

/**
 * Cancels an order and restores stock from immutable line snapshots.
 *
 * A retry after a successful cancellation is a successful no-op. Legacy
 * orders without stock snapshots are rejected rather than guessed at.
 */
export async function cancelOrderForActor(
  profile: UserProfile,
  input: CancelOrderInput,
): Promise<CancelOrderResult> {
  requirePermission(profile, 'ordersCancel')

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const orderRef = db.collection('orders').doc(input.orderId)
    const snapshot = await transaction.get(orderRef)
    if (!snapshot.exists) {
      throw new OperationError('not-found', 'This order no longer exists.')
    }

    const current = { ...(snapshot.data() as Order), id: snapshot.id }
    requireOutletScope(profile, current.outletId)
    requireDepartmentScope(profile, current.departmentId)

    // A retry after a successful cancellation is a successful no-op. This is
    // checked before the expected-status comparison so a stale client copy
    // cannot cause a second restoration or a confusing error.
    if (current.status === 'cancelled') {
      return { id: current.id, status: 'cancelled' as const, restored: false }
    }
    if (input.expectedStatus && current.status !== input.expectedStatus) {
      throw new OperationError(
        'failed-precondition',
        'This order changed while you were working. Refresh and try again.',
      )
    }
    if (!canTransitionOrder(current.status, 'cancelled')) {
      throw new OperationError(
        'failed-precondition',
        `An order cannot move from ${current.status} to cancelled.`,
      )
    }

    const restoration = STOCK_DEDUCTED_STATUSES.includes(current.status)
      ? await stockToRestore(transaction, current)
      : []

    const now = serverNow()
    transaction.update(orderRef, {
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: input.reason?.trim() || 'Cancelled by staff',
      updatedAt: now,
      updatedBy: profile.uid,
    })

    for (const entry of restoration) {
      transaction.update(db.collection('products').doc(entry.productId), {
        stockQty: FieldValue.increment(entry.quantity),
        updatedAt: now,
        updatedBy: profile.uid,
      })
    }

    return {
      id: current.id,
      status: 'cancelled' as const,
      restored: restoration.length > 0,
    }
  })
}

/**
 * Reads every product referenced by the order and calculates the return from
 * the immutable line snapshots. Must run before the first transaction write.
 */
async function stockToRestore(
  transaction: Transaction,
  order: Order,
): Promise<Array<{ productId: string; quantity: number }>> {
  const db = getAdminDb()
  const productIds = Array.from(new Set(order.lines.map((line) => line.productId)))
  for (const productId of productIds) productDocumentId(productId)

  const snapshots = productIds.length > 0
    ? await transaction.getAll(
        ...productIds.map((productId) => db.collection('products').doc(productId)),
      )
    : []

  const products = new Map<string, Product>()
  for (const snapshot of snapshots) {
    if (snapshot.exists) {
      products.set(snapshot.id, { ...(snapshot.data() as Product), id: snapshot.id })
    }
  }

  let restoration: Array<{ productId: string; quantity: number }>
  try {
    restoration = stockRestoration(order.lines, products)
  } catch (error) {
    if (error instanceof Error) throw new DomainError(error.message)
    throw error
  }

  // A tracked product without a numeric stock quantity cannot be restored
  // safely: incrementing a missing field would invent stock. Abort instead.
  for (const entry of restoration) {
    const product = products.get(entry.productId)
    if (
      !product
      || typeof product.stockQty !== 'number'
      || !Number.isFinite(product.stockQty)
    ) {
      throw new DomainError(
        `Cannot restore stock for "${product?.name ?? 'a product'}" because its stock quantity is missing or invalid. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }
  }

  return restoration
}
