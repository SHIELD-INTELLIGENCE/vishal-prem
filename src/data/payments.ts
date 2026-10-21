import { doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { callTrustedOperation } from '@/lib/functions'
import { derivePaymentStatus } from '@/lib/calculations'
import { applyOrderPayment, buildOrderPayment } from '@/lib/paymentOperations'
import { makeReceiptNumber, nowIso } from '@/lib/utils'
import type {
  Booking,
  Order,
  Outlet,
  Payment,
  PaymentMode,
  UserProfile,
} from '@/types/models'

export interface PaymentInput {
  amountRupees: number
  type: 'payment' | 'refund'
  mode: PaymentMode
  reference?: string
  receivedAt: string
  notes?: string
}

export interface SecureOrderPaymentInput extends PaymentInput {
  orderId: string
  requestId: string
}

export interface SecureBookingPaymentInput extends PaymentInput {
  bookingId: string
  requestId: string
}

/**
 * Trusted order payment posting. The endpoint writes the payment record and
 * the order paid/balance/status fields in one transaction, and returns the
 * original receipt when the same request id is retried.
 */
export async function recordOrderPaymentSecure({
  orderId,
  requestId,
  ...input
}: SecureOrderPaymentInput): Promise<{ paymentId: string; receiptNumber: string }> {
  const amountPaise = Math.round(input.amountRupees * 100)
  return callTrustedOperation<
    {
      requestId: string
      orderId: string
      amountPaise: number
      type: 'payment' | 'refund'
      mode: PaymentMode
      reference?: string
      receivedAt: string
      notes?: string
    },
    { paymentId: string; receiptNumber: string }
  >('recordOrderPayment', {
    requestId,
    orderId,
    amountPaise,
    type: input.type,
    mode: input.mode,
    reference: input.reference,
    receivedAt: new Date(input.receivedAt).toISOString(),
    notes: input.notes,
  })
}

/**
 * Trusted booking payment posting. The endpoint reads the live booking,
 * enforces the outstanding/refund limits and writes the payment plus booking
 * balance atomically. A retry with the same request id returns the original
 * receipt.
 */
export async function recordBookingPaymentSecure({
  bookingId,
  requestId,
  ...input
}: SecureBookingPaymentInput): Promise<{ paymentId: string; receiptNumber: string }> {
  const amountPaise = Math.round(input.amountRupees * 100)
  return callTrustedOperation<
    {
      requestId: string
      bookingId: string
      amountPaise: number
      type: 'payment' | 'refund'
      mode: PaymentMode
      reference?: string
      receivedAt: string
      notes?: string
    },
    { paymentId: string; receiptNumber: string }
  >('recordBookingPayment', {
    requestId,
    bookingId,
    amountPaise,
    type: input.type,
    mode: input.mode,
    reference: input.reference,
    receivedAt: new Date(input.receivedAt).toISOString(),
    notes: input.notes,
  })
}

function buildPayment({
  outlet,
  departmentIds,
  employee,
  input,
  customerName,
  customerId,
  orderId,
  bookingId,
  paymentId,
}: {
  outlet: Outlet
  departmentIds: string[]
  employee: UserProfile
  input: PaymentInput
  customerName: string
  customerId?: string
  orderId?: string
  bookingId?: string
  paymentId: string
}): Payment {
  const now = nowIso()
  return {
    id: paymentId,
    receiptNumber: makeReceiptNumber(outlet.code),
    outletId: outlet.id,
    departmentIds,
    orderId,
    bookingId,
    customerId,
    customerName,
    amountPaise: Math.round(input.amountRupees * 100),
    type: input.type,
    mode: input.mode,
    reference: input.reference?.trim() || '',
    receivedAt: new Date(input.receivedAt).toISOString(),
    notes: input.notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
    createdBy: employee.uid,
  }
}

export async function recordOrderPayment({
  order,
  outlet,
  input,
  profile,
}: {
  order: Order
  outlet: Outlet
  input: PaymentInput
  profile: UserProfile
}): Promise<{ paymentId: string; receiptNumber: string }> {
  if (!db) throw new Error('Firestore is not available.')
  const amountPaise = Math.round(input.amountRupees * 100)
  if (amountPaise <= 0) throw new Error('Enter an amount greater than zero.')
  const paymentId = crypto.randomUUID()
  const paymentRef = doc(db, 'payments', paymentId)
  let receiptNumber = ''

  try {
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db!, 'orders', order.id)
      const snapshot = await transaction.get(orderRef)
      if (!snapshot.exists()) throw new Error('This order no longer exists.')
      const current = { ...(snapshot.data() as Order), id: snapshot.id }
      const patch = applyOrderPayment(current, amountPaise, input.type)
      const now = nowIso()
      const payment = buildOrderPayment({
        order: current,
        outlet,
        profile,
        paymentId,
        receiptNumber: makeReceiptNumber(outlet.code),
        amountPaise,
        type: input.type,
        mode: input.mode,
        reference: input.reference,
        receivedAt: new Date(input.receivedAt).toISOString(),
        notes: input.notes,
        now,
      })
      receiptNumber = payment.receiptNumber
      transaction.set(paymentRef, payment)
      transaction.update(orderRef, {
        ...patch,
        updatedAt: now,
        updatedBy: profile.uid,
      })
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return { paymentId, receiptNumber }
}

export async function recordBookingPayment({
  booking,
  outlet,
  input,
  profile,
}: {
  booking: Booking
  outlet: Outlet
  input: PaymentInput
  profile: UserProfile
}): Promise<{ paymentId: string; receiptNumber: string }> {
  if (!db) throw new Error('Firestore is not available.')
  const amountPaise = Math.round(input.amountRupees * 100)
  if (amountPaise <= 0) throw new Error('Enter an amount greater than zero.')
  const paymentId = crypto.randomUUID()
  const paymentRef = doc(db, 'payments', paymentId)
  let receiptNumber = ''

  try {
    await runTransaction(db, async (transaction) => {
      const bookingRef = doc(db!, 'bookings', booking.id)
      const snapshot = await transaction.get(bookingRef)
      if (!snapshot.exists()) throw new Error('This booking no longer exists.')
      const current = snapshot.data() as Booking
      if (current.status === 'cancelled' && input.type === 'payment') {
        throw new Error('Cannot take a payment for a cancelled booking.')
      }
      const delta = input.type === 'refund' ? -amountPaise : amountPaise
      if (input.type === 'refund' && amountPaise > current.paidPaise) {
        throw new Error('The refund cannot exceed the amount already paid.')
      }
      if (input.type === 'payment' && amountPaise > current.balancePaise) {
        throw new Error('The payment cannot exceed the outstanding balance.')
      }
      const paid = current.paidPaise + delta
      const paymentStatus =
        paid === 0 && input.type === 'refund'
          ? 'refunded'
          : derivePaymentStatus(current.totalPaise, paid)
      const payment = buildPayment({
        outlet,
        departmentIds: current.departmentIds,
        employee: profile,
        input,
        customerName: current.customerName,
        customerId: current.customerId,
        bookingId: current.id,
        paymentId,
      })
      receiptNumber = payment.receiptNumber
      transaction.set(paymentRef, payment)
      transaction.update(bookingRef, {
        paidPaise: paid,
        balancePaise: current.totalPaise - paid,
        paymentStatus,
        updatedAt: nowIso(),
        updatedBy: profile.uid,
      })
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return { paymentId, receiptNumber }
}
