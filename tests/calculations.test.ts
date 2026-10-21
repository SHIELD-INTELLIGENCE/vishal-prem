import { describe, expect, it } from 'vitest'
import {
  aggregateStockConsumption,
  calculateLine,
  calculateOrder,
  derivePaymentStatus,
  resolveOrderDiscount,
  stockConsumption,
  stockRestoration,
  canTransitionOrder,
  canTransitionBooking,
  type StockRestorationProduct,
} from '@/lib/calculations'
import type { OrderLine } from '@/types/models'

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    id: 'line-1',
    productId: 'product-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    departmentId: 'dept-sweets',
    pricingMode: 'per_kg',
    quantity: 1,
    unit: 'kg',
    unitPricePaise: 72000,
    discountPercent: 0,
    taxPercent: 5,
    ...overrides,
  }
}

describe('calculateLine', () => {
  it('adds tax on top of a fixed price', () => {
    const result = calculateLine({ quantity: 2, unitPricePaise: 10000, taxPercent: 5 }, false)
    expect(result).toEqual({
      basePaise: 20000,
      discountPaise: 0,
      taxablePaise: 20000,
      taxPaise: 1000,
      totalPaise: 21000,
    })
  })

  it('applies a line discount before tax', () => {
    const result = calculateLine({ quantity: 2, unitPricePaise: 10000, discountPercent: 10, taxPercent: 5 }, false)
    expect(result.basePaise).toBe(20000)
    expect(result.discountPaise).toBe(2000)
    expect(result.taxablePaise).toBe(18000)
    expect(result.taxPaise).toBe(900)
    expect(result.totalPaise).toBe(18900)
  })

  it('extracts included tax without adding it again', () => {
    const result = calculateLine({ quantity: 1, unitPricePaise: 10500, taxPercent: 5 }, true)
    expect(result.taxPaise).toBe(500)
    expect(result.totalPaise).toBe(10500)
  })

  it('supports fractional per-kg quantities', () => {
    const result = calculateLine({ quantity: 1.5, unitPricePaise: 72000, taxPercent: 5 }, false)
    expect(result.basePaise).toBe(108000)
    expect(result.totalPaise).toBe(113400)
  })

  it('never produces a negative total', () => {
    const result = calculateLine({ quantity: 1, unitPricePaise: 0, discountPercent: 100, taxPercent: 5 }, false)
    expect(result.totalPaise).toBe(0)
  })
})

describe('resolveOrderDiscount', () => {
  it('caps a percentage at 100% of the net subtotal', () => {
    expect(resolveOrderDiscount(10000, 'percent', 100)).toBe(10000)
    expect(resolveOrderDiscount(10000, 'percent', 150)).toBe(10000)
  })

  it('caps a fixed discount at the net subtotal', () => {
    expect(resolveOrderDiscount(10000, 'amount', 15000)).toBe(10000)
  })

  it('returns zero for no discount or invalid values', () => {
    expect(resolveOrderDiscount(10000, 'none', 50)).toBe(0)
    expect(resolveOrderDiscount(10000, 'amount', Number.NaN)).toBe(0)
  })
})

describe('calculateOrder', () => {
  it('allocates an order discount proportionally for tax', () => {
    const result = calculateOrder(
      [
        line({ id: 'a', unitPricePaise: 10000, unit: 'piece', quantity: 1 }),
        line({ id: 'b', unitPricePaise: 10000, unit: 'piece', quantity: 1 }),
      ],
      2000,
      false,
    )
    expect(result.subtotalPaise).toBe(20000)
    expect(result.orderDiscountPaise).toBe(2000)
    expect(result.taxPaise).toBe(900)
    expect(result.totalPaise).toBe(18900)
  })

  it('caps an order discount at the subtotal after line discounts', () => {
    const result = calculateOrder([line({ unitPricePaise: 10000, quantity: 1 })], 999999, false)
    expect(result.orderDiscountPaise).toBe(10000)
    expect(result.totalPaise).toBe(0)
  })

  it('handles an empty cart', () => {
    const result = calculateOrder([], 0, false)
    expect(result.totalPaise).toBe(0)
    expect(result.lines).toEqual([])
  })
})

describe('derivePaymentStatus', () => {
  it('derives unpaid, partial and paid states', () => {
    expect(derivePaymentStatus(10000, 0)).toBe('unpaid')
    expect(derivePaymentStatus(10000, 5000)).toBe('partial')
    expect(derivePaymentStatus(10000, 10000)).toBe('paid')
    expect(derivePaymentStatus(10000, 12000)).toBe('paid')
  })

  it('marks negative receipts as refunded', () => {
    expect(derivePaymentStatus(10000, -1)).toBe('refunded')
  })
})

describe('status flows', () => {
  it('allows only the defined order transitions', () => {
    expect(canTransitionOrder('confirmed', 'preparing')).toBe(true)
    expect(canTransitionOrder('confirmed', 'completed')).toBe(false)
    expect(canTransitionOrder('completed', 'cancelled')).toBe(false)
  })

  it('allows only the defined booking transitions', () => {
    expect(canTransitionBooking('enquiry', 'confirmed')).toBe(true)
    expect(canTransitionBooking('enquiry', 'ready')).toBe(false)
    expect(canTransitionBooking('cancelled', 'confirmed')).toBe(false)
  })
})

describe('stockConsumption', () => {
  it('uses a conversion factor when present and defaults to one', () => {
    expect(stockConsumption(2)).toBe(2)
    expect(stockConsumption(2, 0.5)).toBe(1)
    expect(stockConsumption(-4)).toBe(0)
    expect(stockConsumption(3, 0)).toBe(3)
  })
})

describe('aggregateStockConsumption', () => {
  it('adds duplicate tracked lines by product and ignores untracked lines', () => {
    const demand = aggregateStockConsumption([
      { productId: 'product-1', stockTracked: true, stockConsumed: 6 },
      { productId: 'product-2', stockTracked: true, stockConsumed: 3 },
      { productId: 'product-1', stockTracked: true, stockConsumed: 4 },
      { productId: 'product-3', stockTracked: false, stockConsumed: 0 },
    ])

    expect(demand.get('product-1')).toBe(10)
    expect(demand.get('product-2')).toBe(3)
    expect(demand.has('product-3')).toBe(false)
  })

  it('rejects non-finite or non-positive tracked consumption values', () => {
    expect(() =>
      aggregateStockConsumption([{ productId: 'product-1', stockTracked: true, stockConsumed: 0 }]),
    ).toThrow(/invalid stock consumption/i)
    expect(() =>
      aggregateStockConsumption([
        { productId: 'product-1', stockTracked: true, stockConsumed: Number.POSITIVE_INFINITY },
      ]),
    ).toThrow(/invalid stock consumption/i)
  })
})

describe('stockRestoration', () => {
  function product(overrides: Partial<StockRestorationProduct> = {}): StockRestorationProduct {
    return { id: 'product-1', ...overrides }
  }

  function products(...items: StockRestorationProduct[]): Map<string, StockRestorationProduct> {
    return new Map(items.map((item) => [item.id, item]))
  }

  it('returns the saved consumption for a tracked line', () => {
    expect(
      stockRestoration(
        [
          {
            productId: 'product-1',
            name: 'Kaju Barfi',
            stockTracked: true,
            stockConsumed: 2.5,
          },
        ],
        products(product()),
      ),
    ).toEqual([{ productId: 'product-1', quantity: 2.5 }])
  })

  it('skips lines that were not tracked when the order was created', () => {
    expect(
      stockRestoration(
        [
          {
            productId: 'product-1',
            name: 'Kaju Barfi',
            stockTracked: false,
            stockConsumed: 0,
          },
        ],
        products(product()),
      ),
    ).toEqual([])
  })

  it('adds multiple lines for the same product into one restoration entry', () => {
    expect(
      stockRestoration(
        [
          {
            productId: 'product-1',
            name: 'Kaju Barfi',
            stockTracked: true,
            stockConsumed: 3,
          },
          {
            productId: 'product-1',
            name: 'Kaju Barfi',
            stockTracked: true,
            stockConsumed: 4,
          },
        ],
        products(product()),
      ),
    ).toEqual([{ productId: 'product-1', quantity: 7 }])
  })

  it('restores several products and ignores untracked lines', () => {
    expect(
      stockRestoration(
        [
          { productId: 'product-1', name: 'Kaju Barfi', stockTracked: true, stockConsumed: 2 },
          { productId: 'product-2', name: 'Patties', stockTracked: true, stockConsumed: 12 },
          { productId: 'product-3', name: 'Box', stockTracked: false, stockConsumed: 0 },
        ],
        products(product(), product({ id: 'product-2' }), product({ id: 'product-3' })),
      ),
    ).toEqual([
      { productId: 'product-1', quantity: 2 },
      { productId: 'product-2', quantity: 12 },
    ])
  })

  it('throws for a missing product instead of silently under-restoring', () => {
    expect(() =>
      stockRestoration(
        [
          {
            productId: 'deleted',
            name: 'Deleted Sweet',
            stockTracked: true,
            stockConsumed: 1,
          },
        ],
        products(),
      ),
    ).toThrow(/product record no longer exists.*manual/i)
  })

  it('throws when the stock-tracking snapshot is missing', () => {
    expect(() =>
      stockRestoration(
        [{ productId: 'product-1', name: 'Kaju Barfi', stockConsumed: 2 }],
        products(product()),
      ),
    ).toThrow(/stock-tracking snapshot.*manual/i)
  })

  it.each([
    ['zero', 0],
    ['negative', -2],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ] as const)('throws for a %s saved consumption value', (_label, stockConsumed) => {
    expect(() =>
      stockRestoration(
        [
          {
            productId: 'product-1',
            name: 'Kaju Barfi',
            stockTracked: true,
            stockConsumed,
          },
        ],
        products(product()),
      ),
    ).toThrow(/saved stock consumption is invalid.*manual/i)
  })
})
