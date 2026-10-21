import { describe, expect, it } from 'vitest'
import { stockDemandByProduct } from '@/features/orders/orderStockWarning'

function product(
  id: string,
  overrides: Partial<{ trackStock: boolean; conversionFactor: number }> = {},
) {
  return { id, trackStock: true, ...overrides }
}

describe('order form stock warning', () => {
  it('combines duplicate draft lines by product using converted stock units', () => {
    const demand = stockDemandByProduct(
      [
        { productId: 'product-1', quantity: 6 },
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 4 },
        { productId: 'product-3', quantity: 5 },
      ],
      new Map([
        ['product-1', product('product-1', { conversionFactor: 2 })],
        ['product-2', product('product-2')],
        ['product-3', product('product-3', { trackStock: false })],
      ]),
    )

    expect(demand.get('product-1')).toBe(16)
    expect(demand.get('product-2')).toBe(4)
    expect(demand.has('product-3')).toBe(false)
  })

  it('returns no warning demand for invalid draft values', () => {
    const products = new Map([['product-1', product('product-1')]])

    expect(stockDemandByProduct([{ productId: 'product-1', quantity: 0 }], products)).toEqual(
      new Map(),
    )
    expect(
      stockDemandByProduct(
        [{ productId: 'product-1', quantity: 2 }],
        new Map([['product-1', product('product-1', { conversionFactor: 0 })]]),
      ),
    ).toEqual(new Map())
  })
})
