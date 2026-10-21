import { describe, expect, it } from 'vitest'
import { buildPartyStatement } from '@/lib/partyLedger'
import type { Booking, Customer, Order, Payment } from '@/types/models'

const customer = {
  id: 'c1',
  name: 'Party Customer',
  phone: '9876543210',
  outletIds: ['o1'],
  active: true,
  accountGroup: 'retail_customer',
  addresses: [],
  openingBalancePaise: 100000,
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Customer

const order = {
  id: 'order-1',
  orderNumber: 'ORD-1',
  customerId: 'c1',
  customerName: 'Party Customer',
  status: 'confirmed',
  totalPaise: 500000,
  createdAt: '2026-02-01T10:00:00.000Z',
} as unknown as Order

const cancelledOrder = {
  ...order,
  id: 'order-cancelled',
  orderNumber: 'ORD-2',
  status: 'cancelled',
  totalPaise: 900000,
  createdAt: '2026-02-02T10:00:00.000Z',
} as unknown as Order

const otherCustomerOrder = {
  ...order,
  id: 'order-other',
  orderNumber: 'ORD-3',
  customerId: 'c2',
  createdAt: '2026-02-03T10:00:00.000Z',
} as unknown as Order

const booking = {
  id: 'booking-1',
  bookingNumber: 'BKG-1',
  customerId: 'c1',
  customerName: 'Party Customer',
  status: 'confirmed',
  totalPaise: 300000,
  eventType: 'birthday',
  createdAt: '2026-03-01T10:00:00.000Z',
} as unknown as Booking

const payment = {
  id: 'payment-1',
  receiptNumber: 'RCPT-1',
  customerId: 'c1',
  customerName: 'Party Customer',
  amountPaise: 200000,
  type: 'payment',
  mode: 'cash',
  receivedAt: '2026-04-01T10:00:00.000Z',
} as unknown as Payment

const refund = {
  ...payment,
  id: 'refund-1',
  receiptNumber: 'RCPT-2',
  amountPaise: 50000,
  type: 'refund',
  receivedAt: '2026-04-02T10:00:00.000Z',
} as unknown as Payment

describe('party ledger', () => {
  it('derives debits, credits and closing balance from real documents', () => {
    const statement = buildPartyStatement(
      customer,
      [order, cancelledOrder, otherCustomerOrder],
      [booking],
      [payment, refund],
    )
    expect(statement.openingBalancePaise).toBe(100000)
    expect(statement.totalDebitPaise).toBe(100000 + 500000 + 300000 + 50000)
    expect(statement.totalCreditPaise).toBe(200000)
    expect(statement.closingBalancePaise).toBe(750000)
    expect(statement.billedPaise).toBe(800000)
    expect(statement.receivedPaise).toBe(200000)
    expect(statement.entries.map((entry) => entry.referenceType)).toEqual([
      'opening',
      'order',
      'booking',
      'payment',
      'refund',
    ])
  })

  it('handles a credit opening balance and empty history', () => {
    const statement = buildPartyStatement(
      { ...customer, openingBalancePaise: -25000 } as unknown as Customer,
      [],
      [],
      [],
    )
    expect(statement.totalDebitPaise).toBe(0)
    expect(statement.totalCreditPaise).toBe(25000)
    expect(statement.receivedPaise).toBe(0)
    expect(statement.closingBalancePaise).toBe(-25000)
    expect(statement.entries[0]).toMatchObject({ type: 'credit', referenceType: 'opening' })
  })
})
