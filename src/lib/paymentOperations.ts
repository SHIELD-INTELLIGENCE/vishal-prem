import { DomainError } from './domainErrors'
import { derivePaymentStatus } from './calculations'
import type {
  Booking,
  Order,
  Outlet,
  Payment,
  PaymentMode,
  PaymentStatus,
  UserProfile,
} from '../types/models'

export interface OrderPaymentPatch {
  paidPaise: number
  balancePaise: number
  paymentStatus: PaymentStatus
}

/**
 * Applies a payment or refund to an order in memory. Callers persist the
 * returned patch and the payment record inside the same transaction.
 */
export function applyOrderPayment(
  order: Order,
  amountPaise: number,
  type: 'payment' | 'refund',
): OrderPaymentPatch {
  if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new DomainError('Enter an amount greater than zero.')
  }
  if (order.status === 'cancelled' && type === 'payment') {
    throw new DomainError('Cannot take a payment for a cancelled order.')
  }
  const delta = type === 'refund' ? -amountPaise : amountPaise
  if (type === 'refund' && amountPaise > order.paidPaise) {
    throw new DomainError('The refund cannot exceed the amount already paid.')
  }
  if (type === 'payment' && amountPaise > order.balancePaise) {
    throw new DomainError('The payment cannot exceed the outstanding balance.')
  }
  const paid = order.paidPaise + delta
  if (!Number.isFinite(paid)) throw new DomainError('The payment amount is too large.')
  const paymentStatus =
    paid === 0 && type === 'refund'
      ? 'refunded'
      : derivePaymentStatus(order.totalPaise, paid)
  return {
    paidPaise: paid,
    balancePaise: order.totalPaise - paid,
    paymentStatus,
  }
}

/**
 * Applies a payment or refund to a booking in memory. Booking totals and paid
 * fields are only written by the trusted booking-payment operation.
 */
export function applyBookingPayment(
  booking: Booking,
  amountPaise: number,
  type: 'payment' | 'refund',
): OrderPaymentPatch {
  if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new DomainError('Enter an amount greater than zero.')
  }
  if (booking.status === 'cancelled' && type === 'payment') {
    throw new DomainError('Cannot take a payment for a cancelled booking.')
  }
  const delta = type === 'refund' ? -amountPaise : amountPaise
  if (type === 'refund' && amountPaise > booking.paidPaise) {
    throw new DomainError('The refund cannot exceed the amount already paid.')
  }
  if (type === 'payment' && amountPaise > booking.balancePaise) {
    throw new DomainError('The payment cannot exceed the outstanding balance.')
  }
  const paid = booking.paidPaise + delta
  if (!Number.isFinite(paid)) throw new DomainError('The payment amount is too large.')
  return {
    paidPaise: paid,
    balancePaise: booking.totalPaise - paid,
    paymentStatus: paid === 0 && type === 'refund'
      ? 'refunded'
      : derivePaymentStatus(booking.totalPaise, paid),
  }
}

export interface BuildBookingPaymentArgs {
  booking: Booking
  outlet: Outlet
  profile: UserProfile
  paymentId: string
  receiptNumber: string
  amountPaise: number
  type: 'payment' | 'refund'
  mode: PaymentMode
  reference?: string
  receivedAt: string
  notes?: string
  now: string
  deliveryId?: string
}

export function buildBookingPayment({
  booking,
  outlet,
  profile,
  paymentId,
  receiptNumber,
  amountPaise,
  type,
  mode,
  reference,
  receivedAt,
  notes,
  now,
  deliveryId,
}: BuildBookingPaymentArgs): Payment {
  return {
    id: paymentId,
    receiptNumber,
    outletId: outlet.id,
    departmentIds: [...booking.departmentIds],
    bookingId: booking.id,
    deliveryId,
    customerId: booking.customerId,
    customerName: booking.customerName,
    amountPaise,
    type,
    mode,
    reference: reference?.trim() || '',
    receivedAt,
    notes: notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
    createdBy: profile.uid,
  }
}

export interface BuildOrderPaymentArgs {
  order: Order
  outlet: Outlet
  profile: UserProfile
  paymentId: string
  receiptNumber: string
  amountPaise: number
  type: 'payment' | 'refund'
  mode: PaymentMode
  reference?: string
  receivedAt: string
  notes?: string
  now: string
  deliveryId?: string
}

export function buildOrderPayment({
  order,
  outlet,
  profile,
  paymentId,
  receiptNumber,
  amountPaise,
  type,
  mode,
  reference,
  receivedAt,
  notes,
  now,
  deliveryId,
}: BuildOrderPaymentArgs): Payment {
  return {
    id: paymentId,
    receiptNumber,
    outletId: outlet.id,
    departmentIds: [order.departmentId],
    orderId: order.id,
    deliveryId,
    customerId: order.customerId,
    customerName: order.customerName,
    amountPaise,
    type,
    mode,
    reference: reference?.trim() || '',
    receivedAt,
    notes: notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
    createdBy: profile.uid,
  }
}
