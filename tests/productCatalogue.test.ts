import { describe, expect, it } from 'vitest'
import type { Product } from '@/types/models'
import {
  dedupeProducts,
  filterProductsForModule,
  productBarcodeValue,
  productEligibility,
  productIdentity,
  productMatchesSearch,
  productStockState,
  selectableProductsForModule,
  sortProducts,
} from '@/lib/productCatalogue'

const base = {
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  createdBy: 'staff-1',
  updatedBy: 'staff-1',
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    ...base,
    id: 'product-1',
    name: 'Aloo Patties',
    printName: 'ALOO PATTIES',
    group: 'Snacks',
    category: 'Savoury',
    departmentId: 'dept-snacks',
    outletIds: ['outlet-1'],
    pricingMode: 'fixed',
    unit: 'piece',
    salePricePaise: 2500,
    taxPercent: 5,
    trackStock: true,
    stockQty: 0,
    criticalStock: 5,
    active: true,
    available: true,
    ...overrides,
  }
}

describe('productIdentity', () => {
  it('uses the Firestore id when no SKU exists', () => {
    expect(productIdentity(product())).toBe('product-1')
  })

  it('uses the trimmed SKU when present and for barcodes', () => {
    const item = product({ sku: '  ALOO-01  ' })
    expect(productIdentity(item)).toBe('ALOO-01')
    expect(productBarcodeValue(item, 'code128')).toBe('ALOO-01')
    expect(productBarcodeValue(item, 'none')).toBe('')
  })
})

describe('productStockState', () => {
  it('distinguishes untracked from zero stock', () => {
    expect(productStockState(product({ trackStock: false, stockQty: undefined }))).toMatchObject({
      tracked: false,
      qty: null,
      label: 'Stock not tracked',
    })
    expect(productStockState(product({ stockQty: 0 }))).toMatchObject({
      tracked: true,
      qty: 0,
      low: true,
    })
  })
})

describe('productEligibility', () => {
  it('keeps zero-stock products selectable for labels and purchases', () => {
    const item = product({ stockQty: 0 })
    expect(productEligibility(item, 'label')).toMatchObject({ visible: true, selectable: true })
    expect(productEligibility(item, 'purchase')).toMatchObject({ visible: true, selectable: true })
  })

  it('shows untracked products in purchasing but refuses receipt until tracking is enabled', () => {
    const item = product({ trackStock: false })
    expect(productEligibility(item, 'purchase')).toMatchObject({
      visible: true,
      selectable: false,
      reason: expect.stringMatching(/not tracked/i),
    })
    expect(productEligibility(item, 'inventory')).toMatchObject({
      visible: true,
      selectable: false,
    })
  })

  it('refuses zero-stock tracked products for order entry', () => {
    expect(productEligibility(product({ stockQty: 0 }), 'order')).toMatchObject({
      selectable: false,
      reason: 'Out of stock.',
    })
  })

  it('hides products from another department only when a scope is supplied', () => {
    const item = product({ departmentId: 'dept-sweets' })
    expect(productEligibility(item, 'label', { departmentId: 'dept-snacks' }).visible).toBe(false)
    expect(productEligibility(item, 'label', { departmentId: 'all' }).visible).toBe(true)
  })

  it('keeps inactive products visible in the catalogue but not selectable', () => {
    const item = product({ active: false })
    expect(productEligibility(item, 'catalogue')).toMatchObject({ visible: true, selectable: false })
    expect(productEligibility(item, 'label')).toMatchObject({ visible: false, selectable: false })
  })
})

describe('catalogue filtering', () => {
  it('searches by name, alias, SKU and id', () => {
    const item = product({ alias: 'Patties', sku: 'ALOO-01' })
    expect(productMatchesSearch(item, 'aloo')).toBe(true)
    expect(productMatchesSearch(item, 'patties')).toBe(true)
    expect(productMatchesSearch(item, 'product-1')).toBe(true)
    expect(productMatchesSearch(item, 'unknown')).toBe(false)
  })

  it('sorts numerically and deduplicates by document id', () => {
    const rows = [
      product({ id: 'p10', name: 'Item 10' }),
      product({ id: 'p2', name: 'Item 2' }),
      product({ id: 'p2', name: 'Item 2 duplicate' }),
    ]
    expect(sortProducts(rows).map((row) => row.name)).toEqual(['Item 2', 'Item 2 duplicate', 'Item 10'])
    expect(dedupeProducts(rows)).toHaveLength(2)
  })

  it('filters and selects without inventing stock or duplicate records', () => {
    const rows = [
      product({ id: 'a', name: 'A', stockQty: 0 }),
      product({ id: 'b', name: 'B', trackStock: false }),
      product({ id: 'c', name: 'C', active: false }),
    ]
    expect(filterProductsForModule(rows, 'purchase').map((row) => row.id)).toEqual(['a', 'b'])
    expect(selectableProductsForModule(rows, 'purchase').map((row) => row.id)).toEqual(['a'])
  })
})
