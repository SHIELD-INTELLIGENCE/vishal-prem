import {
  applyBookingPayment,
  applyOrderPayment,
  buildBookingPayment,
  buildOrderPayment,
} from '../../../src/lib/paymentOperations'
import type { Booking, Order, Outlet, Payment, UserProfile } from '../../../src/types/models'
import { getAdminDb } from '../admin'
import { makeReceiptNumber, serverNow } from '../utils'
import {
  requireDepartmentScope,
  requireOutletScope,
  requirePermission,
} from './context'
import { OperationError } from './errors'
import type {
  RecordBookingPaymentInput,
  RecordOrderPaymentInput,
} from './validation'

export interface RecordOrderPaymentResult {
  paymentId: string
  receiptNumber: string
}

/**
 * Posts an order payment or refund and updates the order balance in one
 * transaction. The request id is the payment document id, so a retry with the
 * same intent returns the original receipt instead of posting twice.
 */
export async function recordOrderPaymentForActor(
  profile: UserProfile,
  input: RecordOrderPaymentInput,
): Promise<RecordOrderPaymentResult> {
  requirePermission(profile, 'paymentsManage')

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const paymentRef = db.collection('payments').doc(input.requestId)
    const orderRef = db.collection('orders').doc(input.orderId)
    const [paymentSnapshot, orderSnapshot] = await transaction.getAll(paymentRef, orderRef)

    if (paymentSnapshot.exists) {
      const existing = paymentSnapshot.data() as Payment
      if (
        existing.orderId === input.orderId
        && existing.createdBy === profile.uid
        && existing.amountPaise === input.amountPaise
        && existing.type === input.type
      ) {
        return {
          paymentId: paymentSnapshot.id,
          receiptNumber: existing.receiptNumber,
        }
      }
      throw new OperationError(
        'already-exists',
        'That request identifier is already in use by another payment.',
      )
    }

    if (!orderSnapshot.exists) {
      throw new OperationError('not-found', 'This order no longer exists.')
    }

    const current = { ...(orderSnapshot.data() as Order), id: orderSnapshot.id }
    requireOutletScope(profile, current.outletId)
    requireDepartmentScope(profile, current.departmentId)

    const outletSnapshot = await transaction.get(
      db.collection('outlets').doc(current.outletId),
    )
    if (!outletSnapshot.exists) {
      throw new OperationError(
        'failed-precondition',
        'This order has no valid outlet.',
      )
    }
    const outlet = { ...(outletSnapshot.data() as Outlet), id: outletSnapshot.id }
    if (typeof outlet.code !== 'string' || !outlet.code.trim()) {
      throw new OperationError(
        'failed-precondition',
        'The order outlet has no code.',
      )
    }

    const patch = applyOrderPayment(current, input.amountPaise, input.type)
    const now = serverNow()
    const payment = buildOrderPayment({
      order: current,
      outlet,
      profile,
      paymentId: paymentRef.id,
      receiptNumber: makeReceiptNumber(outlet.code),
      amountPaise: input.amountPaise,
      type: input.type,
      mode: input.mode,
      reference: input.reference,
      receivedAt: new Date(input.receivedAt).toISOString(),
      notes: input.notes,
      now,
    })

    transaction.set(paymentRef, payment)
    transaction.update(orderRef, {
      ...patch,
      updatedAt: now,
      updatedBy: profile.uid,
    })

    return { paymentId: paymentRef.id, receiptNumber: payment.receiptNumber }
  })
}

/**
 * Posts a booking payment or refund and updates the booking balance in one
 * transaction. Order and booking payments share the same receipt numbering and
 * cannot be posted twice with the same request id.
 */
export async function recordBookingPaymentForActor(
  profile: UserProfile,
  input: RecordBookingPaymentInput,
): Promise<RecordOrderPaymentResult> {
  requirePermission(profile, 'paymentsManage')

  const db = getAdminDb()
  return db.runTransaction(async (transaction) => {
    const paymentRef = db.collection('payments').doc(input.requestId)
    const bookingRef = db.collection('bookings').doc(input.bookingId)
    const [paymentSnapshot, bookingSnapshot] = await transaction.getAll(
      paymentRef,
      bookingRef,
    )

    if (paymentSnapshot.exists) {
      const existing = paymentSnapshot.data() as Payment
      if (
        existing.bookingId === input.bookingId
        && existing.createdBy === profile.uid
        && existing.amountPaise === input.amountPaise
        && existing.type === input.type
      ) {
        return {
          paymentId: paymentSnapshot.id,
          receiptNumber: existing.receiptNumber,
        }
      }
      throw new OperationError(
        'already-exists',
        'That request identifier is already in use by another payment.',
      )
    }

    if (!bookingSnapshot.exists) {
      throw new OperationError('not-found', 'This booking no longer exists.')
    }

    const current = { ...(bookingSnapshot.data() as Booking), id: bookingSnapshot.id }
    requireOutletScope(profile, current.outletId)
    if (
      !Array.isArray(current.departmentIds)
      || !current.departmentIds.some((departmentId) => {
        try {
          requireDepartmentScope(profile, departmentId)
          return true
        } catch {
          return false
        }
      })
    ) {
      throw new OperationError(
        'permission-denied',
        'This booking department is not assigned to you.',
      )
    }

    const outletSnapshot = await transaction.get(
      db.collection('outlets').doc(current.outletId),
    )
    if (!outletSnapshot.exists) {
      throw new OperationError(
        'failed-precondition',
        'This booking has no valid outlet.',
      )
    }
    const outlet = { ...(outletSnapshot.data() as Outlet), id: outletSnapshot.id }
    if (typeof outlet.code !== 'string' || !outlet.code.trim()) {
      throw new OperationError(
        'failed-precondition',
        'The booking outlet has no code.',
      )
    }

    const patch = applyBookingPayment(current, input.amountPaise, input.type)
    const now = serverNow()
    const payment = buildBookingPayment({
      booking: current,
      outlet,
      profile,
      paymentId: paymentRef.id,
      receiptNumber: makeReceiptNumber(outlet.code),
      amountPaise: input.amountPaise,
      type: input.type,
      mode: input.mode,
      reference: input.reference,
      receivedAt: new Date(input.receivedAt).toISOString(),
      notes: input.notes,
      now,
    })

    transaction.set(paymentRef, payment)
    transaction.update(bookingRef, {
      ...patch,
      updatedAt: now,
      updatedBy: profile.uid,
    })

    return { paymentId: paymentRef.id, receiptNumber: payment.receiptNumber }
  })
}
