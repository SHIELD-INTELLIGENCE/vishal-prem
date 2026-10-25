import { describe, expect, it } from 'vitest'
import {
  buildSupplierLedger,
  computePurchaseLine,
  deriveSupplyType,
  purchaseTotals,
} from '@/lib/gst'
import type { Customer, Purchase, SupplierPayment } from '@/types/models'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

describe('computePurchaseLine', () => {
  it('adds exclusive tax on top of the taxable value', () => {
    const line = computePurchaseLine({
      quantity: 2,
      ratePaise: 10000,
      discountPercent: 10,
      taxPercent: 18,
      taxInclusive: false,
      treatment: 'regular',
      supplyType: 'intra_state',
    })
    expect(line.grossPaise).toBe(20000)
    expect(line.discountPaise).toBe(2000)
    expect(line.taxablePaise).toBe(18000)
    expect(line.taxPaise).toBe(3240)
    expect(line.cgstPaise).toBe(1620)
    expect(line.sgstPaise).toBe(1620)
    expect(line.igstPaise).toBe(0)
    expect(line.totalPaise).toBe(21240)
    expect(line.payablePaise).toBe(21240)
  })

  it('strips tax out of an inclusive rate', () => {
    const line = computePurchaseLine({
      quantity: 1,
      ratePaise: 11800,
      discountPercent: 0,
      taxPercent: 18,
      taxInclusive: true,
      treatment: 'regular',
      supplyType: 'intra_state',
    })
    expect(line.taxablePaise).toBe(10000)
    expect(line.taxPaise).toBe(1800)
    expect(line.totalPaise).toBe(11800)
  })

  it('uses IGST for an inter-state supply and assigns rounding to SGST otherwise', () => {
    const inter = computePurchaseLine({
      quantity: 1,
      ratePaise: 10000,
      discountPercent: 0,
      taxPercent: 18,
      taxInclusive: false,
      treatment: 'regular',
      supplyType: 'inter_state',
    })
    expect(inter.igstPaise).toBe(1800)
    expect(inter.cgstPaise).toBe(0)
    expect(inter.sgstPaise).toBe(0)

    const odd = computePurchaseLine({
      quantity: 1,
      ratePaise: 10001,
      discountPercent: 0,
      taxPercent: 5,
      taxInclusive: false,
      treatment: 'regular',
      supplyType: 'intra_state',
    })
    expect(odd.cgstPaise + odd.sgstPaise).toBe(odd.taxPaise)
  })

  it('records no tax for exempt, nil-rated and zero-rated supplies', () => {
    for (const treatment of ['exempt', 'nil_rated', 'zero_rated'] as const) {
      const line = computePurchaseLine({
        quantity: 1,
        ratePaise: 10000,
        discountPercent: 0,
        taxPercent: 18,
        taxInclusive: false,
        treatment,
        supplyType: 'intra_state',
      })
      expect(line.taxPaise).toBe(0)
      expect(line.totalPaise).toBe(10000)
      expect(line.payablePaise).toBe(10000)
    }
  })

  it('keeps reverse-charge tax out of the supplier payable', () => {
    const line = computePurchaseLine({
      quantity: 1,
      ratePaise: 10000,
      discountPercent: 0,
      taxPercent: 18,
      taxInclusive: false,
      treatment: 'reverse_charge',
      supplyType: 'intra_state',
    })
    expect(line.taxPaise).toBe(1800)
    expect(line.totalPaise).toBe(11800)
    expect(line.rcmTaxPaise).toBe(1800)
    expect(line.payablePaise).toBe(10000)
  })

  it('creates no payable for a stock transfer', () => {
    const line = computePurchaseLine({
      quantity: 1,
      ratePaise: 10000,
      discountPercent: 0,
      taxPercent: 18,
      taxInclusive: false,
      treatment: 'stock_transfer',
      supplyType: 'intra_state',
    })
    expect(line.taxPaise).toBe(0)
    expect(line.payablePaise).toBe(0)
  })

  it('rounds fractional quantities deterministically', () => {
    const line = computePurchaseLine({
      quantity: 1.5,
      ratePaise: 333,
      discountPercent: 0,
      taxPercent: 0,
      taxInclusive: false,
      treatment: 'regular',
      supplyType: 'intra_state',
    })
    expect(line.grossPaise).toBe(500)
  })
})

describe('purchaseTotals', () => {
  it('sums every tax component', () => {
    const totals = purchaseTotals([
      computePurchaseLine({ quantity: 1, ratePaise: 10000, discountPercent: 0, taxPercent: 18, taxInclusive: false, treatment: 'regular', supplyType: 'intra_state' }),
      computePurchaseLine({ quantity: 1, ratePaise: 5000, discountPercent: 0, taxPercent: 18, taxInclusive: false, treatment: 'reverse_charge', supplyType: 'intra_state' }),
    ])
    expect(totals.taxablePaise).toBe(15000)
    expect(totals.taxPaise).toBe(2700)
    expect(totals.rcmTaxPaise).toBe(900)
    expect(totals.totalPaise).toBe(17700)
    // The reverse-charge line adds its tax to the voucher total but not to
    // the amount owed to the supplier: 11,800 + 5,000.
    expect(totals.payablePaise).toBe(16800)
  })
})

describe('deriveSupplyType', () => {
  it('compares supplier and business states', () => {
    expect(deriveSupplyType('Madhya Pradesh', 'Madhya Pradesh')).toBe('intra_state')
    expect(deriveSupplyType('Madhya Pradesh', 'Maharashtra')).toBe('inter_state')
  })

  it('falls back when either state is unknown', () => {
    expect(deriveSupplyType(undefined, 'Maharashtra')).toBe('intra_state')
    expect(deriveSupplyType('Madhya Pradesh', '', 'inter_state')).toBe('inter_state')
  })
})

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    ...base,
    id: 'purchase-1',
    purchaseNumber: 'PUR-1-001',
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
    lines: [],
    subtotalPaise: 10000,
    discountPaise: 0,
    taxablePaise: 10000,
    taxPaise: 1800,
    cgstPaise: 900,
    sgstPaise: 900,
    igstPaise: 0,
    rcmTaxPaise: 0,
    totalPaise: 11800,
    payablePaise: 11800,
    status: 'posted',
    notes: '',
    actorName: 'Staff',
    ...overrides,
  }
}

function payment(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    ...base,
    id: 'payment-1',
    paymentNumber: 'SPAY-1-001',
    supplierId: 'supplier-1',
    supplierName: 'Supplier One',
    outletId: 'outlet-1',
    amountPaise: 3000,
    mode: 'cash',
    reference: '',
    paidAt: '2026-10-02T00:00:00.000Z',
    notes: '',
    status: 'posted',
    actorName: 'Staff',
    ...overrides,
  }
}

describe('buildSupplierLedger', () => {
  it('excludes cancelled vouchers and voided payments', () => {
    const ledger = buildSupplierLedger({
      supplierId: 'supplier-1',
      supplierName: 'Supplier One',
      openingBalancePaise: 5000,
      purchases: [
        purchase(),
        purchase({ id: 'purchase-2', status: 'cancelled', payablePaise: 9999 }),
      ],
      payments: [
        payment(),
        payment({ id: 'payment-2', status: 'void', amountPaise: 1000 }),
      ],
    })
    expect(ledger.purchasedPaise).toBe(11800)
    expect(ledger.paidPaise).toBe(3000)
    expect(ledger.outstandingPaise).toBe(13800)
    expect(ledger.entries.map((entry) => entry.balancePaise)).toEqual([5000, 16800, 13800])
  })

  it('ignores another supplier', () => {
    const ledger = buildSupplierLedger({
      supplierId: 'supplier-1',
      supplierName: 'Supplier One',
      openingBalancePaise: 0,
      purchases: [purchase({ supplierId: 'supplier-2' })],
      payments: [payment({ supplierId: 'supplier-2' })],
    })
    expect(ledger.outstandingPaise).toBe(0)
    expect(ledger.entries).toHaveLength(0)
  })

  it('keeps a negative outstanding as an advance', () => {
    const ledger = buildSupplierLedger({
      supplierId: 'supplier-1',
      supplierName: 'Supplier One',
      openingBalancePaise: 0,
      purchases: [],
      payments: [payment({ amountPaise: 2500 })],
    })
    expect(ledger.outstandingPaise).toBe(-2500)
  })
})

// Keeps the Customer type import meaningful without constructing a full document.
const _customerTypeCheck: Pick<Customer, 'accountGroup'> = { accountGroup: 'supplier' }
void _customerTypeCheck
