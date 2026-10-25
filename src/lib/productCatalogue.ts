/**
 * Canonical product-catalogue rules.
 *
 * Every screen that lists products (catalogue, order entry, purchasing,
 * inventory, labels and reports) must resolve the same Firestore `products`
 * document and apply the same visibility rules. This module is pure so the
 * browser, trusted backend and tests can share it.
 *
 * The important distinction is between *visibility* and *eligibility*:
 *
 * - A product is visible when the user is allowed to see it and the screen's
 *   broad scope includes it (outlet/department).
 * - A product is selectable when the workflow can actually use it. A product
 *   with zero stock is still visible and selectable for labels and purchasing;
 *   a product whose stock is not tracked is visible in purchasing but cannot
 *   be received until stock tracking is explicitly enabled.
 *
 * Nothing here creates stock or transaction history. It only decides what the
 * existing records mean for a given screen.
 */

import type { Product } from '@/types/models'

export type ProductModule =
  | 'catalogue'
  | 'order'
  | 'purchase'
  | 'label'
  | 'inventory'
  | 'report'

export interface ProductScope {
  /** Empty, null or `all` means every department the query already returned. */
  departmentId?: string | null
}

export interface ProductEligibility {
  /** The record belongs in this screen's list at all. */
  visible: boolean
  /** The workflow may act on the record. */
  selectable: boolean
  /** Short, user-facing explanation when `selectable` is false. */
  reason: string | null
  /** Non-blocking warning, for example zero stock on a label or purchase. */
  warning: string | null
}

function departmentMatches(product: Product, scope: ProductScope): boolean {
  const wanted = scope.departmentId?.trim()
  if (!wanted || wanted === 'all') return true
  return product.departmentId === wanted
}

/**
 * Canonical stock description. Stock is authoritative on the product; a
 * product that is not tracked has no balance at all rather than a zero balance.
 */
export function productStockState(product: Product): {
  tracked: boolean
  qty: number | null
  low: boolean
  label: string
} {
  if (!product.trackStock) {
    return { tracked: false, qty: null, low: false, label: 'Stock not tracked' }
  }
  const qty = typeof product.stockQty === 'number' && Number.isFinite(product.stockQty)
    ? product.stockQty
    : 0
  const critical = typeof product.criticalStock === 'number' ? product.criticalStock : 0
  return {
    tracked: true,
    qty,
    low: qty <= critical,
    label: `${qty} ${product.unit}`.trim(),
  }
}

/**
 * The stable business identity used by labels, barcodes and reports. The
 * Firestore document id is always the canonical reference; SKU is the optional
 * human/barcode-facing code.
 */
export function productIdentity(product: Pick<Product, 'id' | 'sku'>): string {
  return product.sku?.trim() || product.id
}

export function productBarcodeValue(
  product: Pick<Product, 'id' | 'sku'>,
  format: 'code128' | 'none',
): string {
  if (format === 'none') return ''
  return productIdentity(product)
}

export function productSearchText(product: Product): string {
  return [
    product.name,
    product.alias,
    product.printName,
    product.sku,
    product.category,
    product.group,
    product.hsn,
    product.id,
  ]
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(' ')
    .toLowerCase()
}

export function productMatchesSearch(product: Product, term: string): boolean {
  const query = term.trim().toLowerCase()
  if (!query) return true
  return productSearchText(product).includes(query)
}

export function sortProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) =>
    a.name.localeCompare(b.name, 'en-IN', { numeric: true, sensitivity: 'base' }),
  )
}

/** Removes duplicate documents while keeping the first occurrence. */
export function dedupeProducts(products: Product[]): Product[] {
  const seen = new Set<string>()
  const result: Product[] = []
  for (const product of products) {
    if (seen.has(product.id)) continue
    seen.add(product.id)
    result.push(product)
  }
  return result
}

export function productEligibility(
  product: Product,
  module: ProductModule,
  scope: ProductScope = {},
): ProductEligibility {
  if (!departmentMatches(product, scope)) {
    return {
      visible: false,
      selectable: false,
      reason: 'Belongs to another department.',
      warning: null,
    }
  }

  if (!product.active) {
    return {
      visible: module === 'inventory' || module === 'catalogue',
      selectable: false,
      reason: 'Product is inactive.',
      warning: null,
    }
  }

  const stock = productStockState(product)

  switch (module) {
    case 'catalogue':
    case 'report':
      return { visible: true, selectable: true, reason: null, warning: null }

    case 'label':
      // Labels are physical product-information labels. They do not consume or
      // create stock, so zero stock is never a reason to hide a product.
      return {
        visible: true,
        selectable: true,
        reason: null,
        warning: stock.tracked && stock.qty === 0 ? 'Zero stock — labelling does not change stock.' : null,
      }

    case 'purchase':
      if (!product.trackStock) {
        return {
          visible: true,
          selectable: false,
          reason: 'Stock is not tracked. Enable stock tracking to receive stock.',
          warning: null,
        }
      }
      return {
        visible: true,
        selectable: true,
        reason: null,
        warning: stock.qty === 0 ? 'Zero stock — this purchase will increase it.' : null,
      }

    case 'inventory':
      return {
        visible: true,
        selectable: product.trackStock,
        reason: product.trackStock ? null : 'Stock is not tracked. Enable stock tracking to adjust it.',
        warning: product.trackStock && stock.qty === 0 ? 'Zero stock' : null,
      }

    case 'order':
      if (!product.available) {
        return {
          visible: true,
          selectable: false,
          reason: 'Marked unavailable.',
          warning: null,
        }
      }
      if (product.trackStock && stock.qty !== null && stock.qty <= 0) {
        return {
          visible: true,
          selectable: false,
          reason: 'Out of stock.',
          warning: null,
        }
      }
      return { visible: true, selectable: true, reason: null, warning: null }

    default:
      return { visible: true, selectable: true, reason: null, warning: null }
  }
}

export function filterProductsForModule(
  products: Product[],
  module: ProductModule,
  scope: ProductScope = {},
): Product[] {
  return sortProducts(
    dedupeProducts(products).filter(
      (product) => productEligibility(product, module, scope).visible,
    ),
  )
}

export function selectableProductsForModule(
  products: Product[],
  module: ProductModule,
  scope: ProductScope = {},
): Product[] {
  return sortProducts(
    dedupeProducts(products).filter(
      (product) => productEligibility(product, module, scope).selectable,
    ),
  )
}
