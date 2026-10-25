import { describe, expect, it } from 'vitest'
import {
  buildAnalysisSummary,
  buildItemAnalysis,
  buildPartyAnalysis,
} from '@/lib/analysis'
import type {
  Booking,
  Customer,
  Order,
  OrderLine,
  Payment,
  Purchase,
  PurchaseLine,
} from '@/types/models'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 'line-1',
    productId: 'product-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    departmentId: 'dept-sweets',
    pricingMode: 'fixed',
    quantity: 2,
    unit: 'kg',
    unitPricePaise: 10000,
    discountPercent: 10,
    taxPercent: 5,
    ...overrides,
  }
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    ...base,
    id: 'order-1',
    orderNumber: 'ORD-1',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    customerId: 'customer-1',
    customerName: 'Customer One',
    channel: 'counter',
    orderType: 'takeaway',
    status: 'completed',
    paymentStatus: 'paid',
    lines: [
      line(),
      line({
        id: 'line-2',
        productId: 'product-2',
        name: 'Soan Papdi',
        quantity: 1,
        unitPricePaise: 5000,
        discountPercent: 0,
      }),
    ],
    subtotalPaise: 25000,
    lineDiscountPaise: 2000,
    orderDiscountPaise: 1000,
    discountPaise: 3000,
    taxPaise: 1100,
    totalPaise: 23100,
    paidPaise: 23100,
    balancePaise: 0,
    pricesIncludeTax: false,
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    ...overrides,
  }
}

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    ...base,
    id: 'booking-1',
    bookingNumber: 'BKG-1',
    outletId: 'outlet-1',
    departmentIds: ['dept-sweets'],
    customerId: 'customer-1',
    customerName: 'Customer One',
    customerPhone: '9000000000',
    eventType: 'birthday',
    eventDate: '2026-10-20T00:00:00.000Z',
    eventTime: '18:00',
    bookingDate: '2026-10-01T00:00:00.000Z',
    fulfillment: 'pickup',
    status: 'confirmed',
    paymentStatus: 'partial',
    lines: [line({ id: 'booking-line-1', quantity: 1, unitPricePaise: 5000, discountPercent: 0 })],
    subtotalPaise: 5000,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 250,
    totalPaise: 5250,
    paidPaise: 1000,
    balancePaise: 4250,
    pricesIncludeTax: false,
    preparationStatus: 'pending',
    packingStatus: 'pending',
    ...overrides,
  }
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    ...base,
    id: 'payment-1',
    receiptNumber: 'RCP-1',
    outletId: 'outlet-1',
    departmentIds: ['dept-sweets'],
    customerId: 'customer-1',
    customerName: 'Customer One',
    amountPaise: 5000,
    type: 'payment',
    mode: 'cash',
    receivedAt: '2026-10-05T10:00:00.000Z',
    createdAt: '2026-10-05T10:00:00.000Z',
    ...overrides,
  }
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    ...base,
    id: 'customer-1',
    name: 'Customer One',
    type: 'individual',
    accountGroup: 'retail_customer',
    phone: '9000000000',
    addresses: [],
    openingBalancePaise: 0,
    outletIds: ['outlet-1'],
    active: true,
    ...overrides,
  }
}

function purchaseLine(overrides: Partial<PurchaseLine> = {}): PurchaseLine {
  return {
    id: 'purchase-line-1',
    itemType: 'product',
    itemId: 'product-1',
    name: 'Kaju Barfi',
    unit: 'kg',
    hsn: '2106',
    quantity: 5,
    ratePaise: 8000,
    discountPercent: 0,
    taxPercent: 18,
    taxInclusive: false,
    taxablePaise: 40000,
    taxPaise: 7200,
    cgstPaise: 3600,
    sgstPaise: 3600,
    igstPaise: 0,
    totalPaise: 47200,
    ...overrides,
  }
}

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    ...base,
    id: 'purchase-1',
    purchaseNumber: 'PUR-1',
    supplierId: 'supplier-1',
    supplierName: 'Supplier One',
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-10-01T00:00:00.000Z',
    receivedAt: '2026-10-01T00:00:00.000Z',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    taxTreatment: 'regular',
    supplyType: 'intra_state',
    reverseCharge: false,
    taxInclusive: false,
    itcClaimable: true,
    lines: [purchaseLine()],
    subtotalPaise: 40000,
    discountPaise: 0,
    taxablePaise: 40000,
    taxPaise: 7200,
    cgstPaise: 3600,
    sgstPaise: 3600,
    igstPaise: 0,
    rcmTaxPaise: 0,
    totalPaise: 47200,
    payablePaise: 47200,
    status: 'posted',
    notes: '',
    actorName: 'Staff',
    ...overrides,
  }
}

describe('buildItemAnalysis', () => {
  it('allocates the order discount and strips no tax from exclusive prices', () => {
    const rows = buildItemAnalysis({
      orders: [order()],
      bookings: [],
      purchases: [],
    })
    const barfi = rows.find((row) => row.key === 'product:product-1')
    const papdi = rows.find((row) => row.key === 'product:product-2')
    // 18,000 line value less a proportional share of the 1,000 order discount.
    expect(barfi?.taxableSalesPaise).toBe(17217)
    expect(barfi?.taxPaise).toBe(861)
    expect(papdi?.taxableSalesPaise).toBe(4783)
    expect(papdi?.taxPaise).toBe(239)
    // Item values reconcile to the discounted document value.
    expect((barfi?.taxableSalesPaise ?? 0) + (papdi?.taxableSalesPaise ?? 0)).toBe(22000)
  })

  it('strips GST from tax-inclusive prices', () => {
    const rows = buildItemAnalysis({
      orders: [
        order({
          pricesIncludeTax: true,
          lines: [line({ quantity: 1, unitPricePaise: 11800, discountPercent: 0, taxPercent: 18 })],
          orderDiscountPaise: 0,
          totalPaise: 11800,
          taxPaise: 1800,
        }),
      ],
      bookings: [],
      purchases: [],
    })
    expect(rows[0].taxableSalesPaise).toBe(10000)
    expect(rows[0].taxPaise).toBe(1800)
  })

  it('ignores cancelled documents and matches posted purchase lines', () => {
    const rows = buildItemAnalysis({
      orders: [order({ status: 'cancelled' })],
      bookings: [],
      purchases: [
        purchase(),
        purchase({ id: 'purchase-2', status: 'cancelled', lines: [purchaseLine({ taxablePaise: 9999 })] }),
      ],
    })
    const barfi = rows.find((row) => row.key === 'product:product-1')
    expect(barfi?.quantitySold).toBe(0)
    expect(barfi?.quantityPurchased).toBe(5)
    expect(barfi?.taxablePurchasePaise).toBe(40000)
    expect(barfi?.marginPaise).toBeNull()
  })

  it('only shows margin when a product has both sales and purchases', () => {
    const rows = buildItemAnalysis({
      orders: [order()],
      bookings: [],
      purchases: [purchase()],
    })
    const barfi = rows.find((row) => row.key === 'product:product-1')
    expect(barfi?.marginPaise).toBe(17217 - 40000)
    expect(barfi?.marginPercent).toBe(-132.3)
    const papdi = rows.find((row) => row.key === 'product:product-2')
    expect(papdi?.marginPaise).toBeNull()
  })

  it('keeps inventory purchases in their own row', () => {
    const rows = buildItemAnalysis({
      orders: [],
      bookings: [],
      purchases: [
        purchase({
          lines: [purchaseLine({ itemType: 'inventory', itemId: 'item-sugar', name: 'Sugar', unit: 'kg', taxablePaise: 5000 })],
        }),
      ],
    })
    const sugar = rows.find((row) => row.key === 'inventory:item-sugar')
    expect(sugar).toMatchObject({ itemType: 'inventory', quantityPurchased: 5, taxablePurchasePaise: 5000 })
  })
})

describe('buildAnalysisSummary', () => {
  it('reports sales, purchases and the period margin', () => {
    const orders = [order()]
    const purchases = [
      purchase(),
      purchase({
        id: 'purchase-2',
        status: 'cancelled',
        lines: [purchaseLine({ taxablePaise: 9999, taxPaise: 999 })],
      }),
    ]
    const itemRows = buildItemAnalysis({ orders, bookings: [], purchases })
    const summary = buildAnalysisSummary({ orders, bookings: [], purchases, itemRows })
    expect(summary.orders).toBe(1)
    expect(summary.salesPaise).toBe(23100)
    expect(summary.taxableSalesPaise).toBe(22000)
    expect(summary.purchaseVouchers).toBe(1)
    expect(summary.purchasesPaise).toBe(47200)
    expect(summary.taxablePurchasePaise).toBe(40000)
    expect(summary.inputTaxPaise).toBe(7200)
    expect(summary.periodMarginPaise).toBe(-18000)
    expect(summary.periodMarginPercent).toBe(-81.8)
    expect(summary.averageOrderPaise).toBe(23100)
    expect(summary.itemsSold).toBe(3)
  })

  it('includes active bookings and excludes cancelled ones', () => {
    const bookings = [booking(), booking({ id: 'booking-2', status: 'cancelled', totalPaise: 9999 })]
    const itemRows = buildItemAnalysis({ orders: [], bookings, purchases: [] })
    const summary = buildAnalysisSummary({ orders: [], bookings, purchases: [], itemRows })
    expect(summary.orders).toBe(1)
    expect(summary.salesPaise).toBe(5250)
    expect(summary.taxableSalesPaise).toBe(5000)
    expect(summary.taxPaise).toBe(250)
  })
})

describe('buildPartyAnalysis', () => {
  it('reuses the party statement for billed, received and balance', () => {
    const rows = buildPartyAnalysis({
      customers: [customer()],
      orders: [order()],
      bookings: [],
      payments: [payment()],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      customerId: 'customer-1',
      documents: 1,
      billedPaise: 23100,
      receivedPaise: 5000,
      balancePaise: 18100,
      averageBillPaise: 23100,
      lastActivityAt: '2026-10-05T10:00:00.000Z',
    })
  })

  it('hides parties without any activity', () => {
    const rows = buildPartyAnalysis({
      customers: [customer(), customer({ id: 'customer-2', name: 'Idle' })],
      orders: [],
      bookings: [],
      payments: [],
    })
    expect(rows).toHaveLength(0)
  })

  it('excludes cancelled documents from the document count', () => {
    const rows = buildPartyAnalysis({
      customers: [customer()],
      orders: [order({ status: 'cancelled' })],
      bookings: [],
      payments: [payment()],
    })
    expect(rows[0].documents).toBe(0)
    expect(rows[0].receivedPaise).toBe(5000)
    expect(rows[0].averageBillPaise).toBeNull()
  })
})
