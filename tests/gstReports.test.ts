import { describe, expect, it } from 'vitest'
import {
  ACCOUNTING_PREREQUISITES,
  buildGstSummary,
  buildPurchaseHsnSummary,
  buildPurchaseTaxRateSummary,
  buildSupplierTaxSummary,
  buildTreatmentSummary,
} from '@/lib/gstReports'
import type { Booking, Order, Purchase, PurchaseLine } from '@/types/models'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

function purchaseLine(overrides: Partial<PurchaseLine> = {}): PurchaseLine {
  return {
    id: 'line-1',
    itemType: 'inventory',
    itemId: 'item-1',
    name: 'Sugar',
    unit: 'kg',
    hsn: '1701',
    quantity: 2,
    ratePaise: 10000,
    discountPercent: 0,
    taxPercent: 18,
    taxInclusive: false,
    taxablePaise: 20000,
    taxPaise: 3600,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    totalPaise: 23600,
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
    subtotalPaise: 20000,
    discountPaise: 0,
    taxablePaise: 20000,
    taxPaise: 3600,
    cgstPaise: 1800,
    sgstPaise: 1800,
    igstPaise: 0,
    rcmTaxPaise: 0,
    totalPaise: 23600,
    payablePaise: 23600,
    status: 'posted',
    notes: '',
    actorName: 'Staff',
    ...overrides,
  }
}

const reverseChargePurchase = purchase({
  id: 'purchase-2',
  taxTreatment: 'reverse_charge',
  reverseCharge: true,
  lines: [purchaseLine({ id: 'line-2', name: 'Freight', hsn: '', quantity: 1, taxablePaise: 5000, taxPaise: 900, cgstPaise: 450, sgstPaise: 450, totalPaise: 5900 })],
  subtotalPaise: 5000,
  taxablePaise: 5000,
  taxPaise: 900,
  cgstPaise: 450,
  sgstPaise: 450,
  rcmTaxPaise: 900,
  totalPaise: 5900,
  payablePaise: 5000,
})

const cancelledPurchase = purchase({
  id: 'purchase-3',
  status: 'cancelled',
  taxablePaise: 9999,
  taxPaise: 999,
})

function order(overrides: Partial<Order> = {}): Order {
  return {
    ...base,
    id: 'order-1',
    orderNumber: 'ORD-1',
    outletId: 'outlet-1',
    departmentId: 'dept-sweets',
    customerName: 'Walk-in',
    channel: 'counter',
    orderType: 'takeaway',
    status: 'completed',
    paymentStatus: 'paid',
    lines: [],
    subtotalPaise: 11800,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 1800,
    totalPaise: 11800,
    paidPaise: 11800,
    balancePaise: 0,
    pricesIncludeTax: true,
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
    lines: [],
    subtotalPaise: 5900,
    lineDiscountPaise: 0,
    orderDiscountPaise: 0,
    discountPaise: 0,
    taxPaise: 900,
    totalPaise: 5900,
    paidPaise: 1000,
    balancePaise: 4900,
    pricesIncludeTax: true,
    preparationStatus: 'pending',
    packingStatus: 'pending',
    ...overrides,
  }
}

describe('buildGstSummary', () => {
  it('derives outward, inward and net working figures from posted documents', () => {
    const summary = buildGstSummary({
      orders: [order(), order({ id: 'order-2', status: 'cancelled', totalPaise: 9999, taxPaise: 999 })],
      bookings: [booking(), booking({ id: 'booking-2', status: 'cancelled', totalPaise: 9999, taxPaise: 999 })],
      purchases: [purchase(), reverseChargePurchase, cancelledPurchase],
    })
    expect(summary.outwardDocuments).toBe(2)
    expect(summary.outwardTaxablePaise).toBe(15000)
    expect(summary.outwardTaxPaise).toBe(2700)
    expect(summary.inwardDocuments).toBe(2)
    expect(summary.inwardTaxablePaise).toBe(25000)
    expect(summary.inwardTaxPaise).toBe(4500)
    expect(summary.cgstPaise).toBe(2250)
    expect(summary.sgstPaise).toBe(2250)
    expect(summary.igstPaise).toBe(0)
    expect(summary.rcmTaxPaise).toBe(900)
    expect(summary.itcClaimablePaise).toBe(4500)
    expect(summary.netWorkingPositionPaise).toBe(-1800)
  })

  it('excludes purchases that are not marked claimable from ITC', () => {
    const summary = buildGstSummary({
      orders: [],
      bookings: [],
      purchases: [purchase({ itcClaimable: false })],
    })
    expect(summary.itcClaimablePaise).toBe(0)
    expect(summary.netWorkingPositionPaise).toBe(0)
  })
})

describe('buildTreatmentSummary', () => {
  it('groups posted purchases by tax treatment', () => {
    const rows = buildTreatmentSummary([purchase(), reverseChargePurchase, cancelledPurchase])
    expect(rows).toHaveLength(2)
    const regular = rows.find((row) => row.treatment === 'regular')
    const reverse = rows.find((row) => row.treatment === 'reverse_charge')
    expect(regular).toMatchObject({ documents: 1, taxablePaise: 20000, taxPaise: 3600 })
    expect(reverse).toMatchObject({ documents: 1, taxablePaise: 5000, taxPaise: 900, rcmTaxPaise: 900 })
  })
})

describe('buildPurchaseHsnSummary', () => {
  it('summarises purchase HSN lines and marks missing codes', () => {
    const rows = buildPurchaseHsnSummary([purchase(), reverseChargePurchase])
    const sugar = rows.find((row) => row.hsn === '1701')
    const unspecified = rows.find((row) => row.hsn === 'Unspecified')
    expect(sugar).toMatchObject({ quantity: 2, taxablePaise: 20000, taxPaise: 3600 })
    expect(unspecified).toMatchObject({ quantity: 1, taxablePaise: 5000, taxPaise: 900 })
  })
})

describe('buildSupplierTaxSummary', () => {
  it('groups purchases and payable by supplier', () => {
    const rows = buildSupplierTaxSummary([purchase(), reverseChargePurchase])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      supplierId: 'supplier-1',
      documents: 2,
      taxablePaise: 25000,
      taxPaise: 4500,
      rcmTaxPaise: 900,
      payablePaise: 28600,
    })
  })
})

describe('buildPurchaseTaxRateSummary', () => {
  it('groups purchase lines by tax rate', () => {
    const rows = buildPurchaseTaxRateSummary([purchase(), reverseChargePurchase])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ taxPercent: 18, documents: 2, taxablePaise: 25000, taxPaise: 4500 })
  })
})

describe('ACCOUNTING_PREREQUISITES', () => {
  it('documents the real gaps instead of implying a trial balance exists', () => {
    expect(ACCOUNTING_PREREQUISITES.length).toBeGreaterThan(3)
    expect(ACCOUNTING_PREREQUISITES.join(' ')).toMatch(/trial balance/i)
    expect(ACCOUNTING_PREREQUISITES.join(' ')).toMatch(/not a filed return/i)
  })
})
