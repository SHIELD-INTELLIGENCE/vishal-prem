import { aggregateStockConsumption, stockConsumption } from '@/lib/calculations'
import type { Product } from '@/types/models'

type DraftStockLine = { productId?: string; quantity?: number }
type StockProduct = Pick<Product, 'id' | 'trackStock' | 'conversionFactor'>

/**
 * Combined stock demand for the order form's warning.
 *
 * This mirrors the data layer's aggregate-by-product calculation. Invalid
 * draft values return an empty map because the form's field validation already
 * explains them and no reliable warning can be shown.
 */
export function stockDemandByProduct(
  lines: ReadonlyArray<DraftStockLine>,
  products: ReadonlyMap<string, StockProduct>,
): Map<string, number> {
  const draftLines = lines.map((line) => {
    const product = products.get(line.productId ?? '')
    if (!product?.trackStock) {
      return { productId: product?.id ?? '', stockTracked: false, stockConsumed: 0 }
    }
    const quantity = Number(line.quantity)
    const factor = product.conversionFactor
    const conversionFactor = factor ?? 1
    const stockConsumed =
      factor !== undefined && (!Number.isFinite(factor) || factor <= 0)
        ? Number.NaN
        : stockConsumption(quantity, conversionFactor)
    return {
      productId: product.id,
      stockTracked: true,
      stockConsumed,
    }
  })

  try {
    return aggregateStockConsumption(draftLines)
  } catch {
    return new Map<string, number>()
  }
}
