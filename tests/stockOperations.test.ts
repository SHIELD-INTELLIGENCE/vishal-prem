import { describe, expect, it } from 'vitest'
import { applyStockAdjustment } from '@/lib/stockOperations'
import type { Product } from '@/types/models'

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Kaju Barfi',
    printName: 'KAJU BARFI',
    group: 'Sweets',
    category: 'Barfi',
    departmentId: 'd1',
    outletIds: ['o1'],
    pricingMode: 'fixed',
    unit: 'piece',
    conversionFactor: 1,
    salePricePaise: 10000,
    taxPercent: 5,
    trackStock: true,
    openingStock: 10,
    stockQty: 10,
    criticalStock: 1,
    batchTracking: false,
    expiryTracking: false,
    active: true,
    available: true,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('applyStockAdjustment', () => {
  it('allows a positive balance to be reduced to exactly zero', () => {
    expect(applyStockAdjustment(product({ stockQty: 10 }), -10)).toEqual({
      previousStockQty: 10,
      resultingStockQty: 0,
    })
  })

  it('allows a positive balance to be reduced to a smaller positive balance', () => {
    expect(applyStockAdjustment(product({ stockQty: 10 }), -2.5)).toEqual({
      previousStockQty: 10,
      resultingStockQty: 7.5,
    })
  })

  it('rejects a zero-delta adjustment with a clear validation message', () => {
    expect(() => applyStockAdjustment(product({ stockQty: 10 }), 0)).toThrow(
      /non-zero stock adjustment/i,
    )
  })

  it('rejects an adjustment that would make the balance negative', () => {
    expect(() => applyStockAdjustment(product({ stockQty: 2 }), -3)).toThrow(
      /would make .* stock negative/i,
    )
  })

  it('rejects stock changes for an untracked product', () => {
    expect(() => applyStockAdjustment(product({ trackStock: false }), -1)).toThrow(
      /Stock is not tracked/i,
    )
  })

  it('rejects an adjustment when the live balance is missing or invalid', () => {
    expect(() => applyStockAdjustment(product({ stockQty: undefined }), -1)).toThrow(
      /missing or invalid/i,
    )
    expect(() => applyStockAdjustment(product({ stockQty: Number.NaN }), -1)).toThrow(
      /missing or invalid/i,
    )
  })

  it('rejects an adjustment above the supported maximum', () => {
    expect(() => applyStockAdjustment(product({ stockQty: 1_000_000 }), 1)).toThrow(
      /supported maximum/i,
    )
  })

  it('rounds fractional balances deterministically and never returns negative zero', () => {
    expect(applyStockAdjustment(product({ stockQty: 0.1 }), 0.2)).toEqual({
      previousStockQty: 0.1,
      resultingStockQty: 0.3,
    })
    expect(applyStockAdjustment(product({ stockQty: 0.3 }), -0.3)).toEqual({
      previousStockQty: 0.3,
      resultingStockQty: 0,
    })
  })

  it('allows a positive adjustment to recover a legacy negative balance without inventing a negative result', () => {
    expect(applyStockAdjustment(product({ stockQty: -2 }), 2)).toEqual({
      previousStockQty: -2,
      resultingStockQty: 0,
    })
  })
})
