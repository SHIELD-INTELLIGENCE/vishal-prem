import type { Booking, Customer, Order, Payment } from '@/types/models'

export interface PartyLedgerEntry {
  id: string
  date: string
  type: 'debit' | 'credit'
  amountPaise: number
  referenceType: 'opening' | 'order' | 'booking' | 'payment' | 'refund'
  referenceId: string
  referenceNumber: string
  description: string
}

export interface PartyStatement {
  openingBalancePaise: number
  entries: PartyLedgerEntry[]
  totalDebitPaise: number
  totalCreditPaise: number
  closingBalancePaise: number
  billedPaise: number
  receivedPaise: number
}

/**
 * Derives a party statement from the commercial documents that already exist.
 * Orders/bookings are debits, receipts are credits and refunds are debits.
 * This keeps existing data usable without inventing a second, conflicting
 * balance and without rewriting historic paid/balance fields.
 */
export function buildPartyStatement(
  customer: Customer,
  orders: Order[],
  bookings: Booking[],
  payments: Payment[],
): PartyStatement {
  const entries: PartyLedgerEntry[] = []

  const opening = Math.round(customer.openingBalancePaise ?? 0)
  if (opening !== 0) {
    entries.push({
      id: `opening-${customer.id}`,
      date: customer.createdAt,
      type: opening > 0 ? 'debit' : 'credit',
      amountPaise: Math.abs(opening),
      referenceType: 'opening',
      referenceId: customer.id,
      referenceNumber: 'Opening',
      description: 'Opening balance',
    })
  }

  for (const order of orders) {
    if (order.customerId !== customer.id || order.status === 'cancelled') continue
    entries.push({
      id: `order-${order.id}`,
      date: order.createdAt,
      type: 'debit',
      amountPaise: order.totalPaise,
      referenceType: 'order',
      referenceId: order.id,
      referenceNumber: order.orderNumber,
      description: `Order · ${order.customerName}`,
    })
  }

  for (const booking of bookings) {
    if (booking.customerId !== customer.id || booking.status === 'cancelled') continue
    entries.push({
      id: `booking-${booking.id}`,
      date: booking.createdAt,
      type: 'debit',
      amountPaise: booking.totalPaise,
      referenceType: 'booking',
      referenceId: booking.id,
      referenceNumber: booking.bookingNumber,
      description: `Booking · ${booking.eventType.replace(/_/g, ' ')}`,
    })
  }

  for (const payment of payments) {
    if (payment.customerId !== customer.id) continue
    const refund = payment.type === 'refund'
    entries.push({
      id: `payment-${payment.id}`,
      date: payment.receivedAt,
      type: refund ? 'debit' : 'credit',
      amountPaise: payment.amountPaise,
      referenceType: refund ? 'refund' : 'payment',
      referenceId: payment.id,
      referenceNumber: payment.receiptNumber,
      description: refund
        ? `Refund · ${payment.mode.replace(/_/g, ' ')}`
        : `Receipt · ${payment.mode.replace(/_/g, ' ')}`,
    })
  }

  entries.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id)
  })

  const totalDebitPaise = entries
    .filter((entry) => entry.type === 'debit')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)
  const totalCreditPaise = entries
    .filter((entry) => entry.type === 'credit')
    .reduce((sum, entry) => sum + entry.amountPaise, 0)

  return {
    openingBalancePaise: opening,
    entries,
    totalDebitPaise,
    totalCreditPaise,
    closingBalancePaise: totalDebitPaise - totalCreditPaise,
    billedPaise: entries
      .filter((entry) => entry.referenceType === 'order' || entry.referenceType === 'booking')
      .reduce((sum, entry) => sum + entry.amountPaise, 0),
    receivedPaise: entries
      .filter((entry) => entry.referenceType === 'payment')
      .reduce((sum, entry) => sum + entry.amountPaise, 0),
  }
}
