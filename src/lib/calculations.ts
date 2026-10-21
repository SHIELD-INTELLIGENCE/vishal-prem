import type {
  BookingStatus,
  LineTotals,
  OrderLine,
  OrderStatus,
  OrderTotals,
  PaymentStatus,
} from '@/types/models'

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function roundPaise(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value)
}

export interface LineCalculationInput {
  quantity: number
  unitPricePaise: number
  discountPercent?: number
  taxPercent?: number
}

/**
 * Calculates one order line in integer paise.
 * `pricesIncludeTax` decides whether the unit price already contains tax.
 */
export function calculateLine(
  input: LineCalculationInput,
  pricesIncludeTax: boolean,
): LineTotals {
  const quantity = Number.isFinite(input.quantity) ? Math.max(0, input.quantity) : 0
  const unitPrice = Math.max(0, roundPaise(input.unitPricePaise))
  const discountPercent = clamp(input.discountPercent ?? 0, 0, 100)
  const taxPercent = clamp(input.taxPercent ?? 0, 0, 100)

  const basePaise = roundPaise(quantity * unitPrice)
  const discountPaise = roundPaise((basePaise * discountPercent) / 100)
  const taxablePaise = Math.max(0, basePaise - discountPaise)

  let taxPaise: number
  let totalPaise: number
  if (pricesIncludeTax) {
    taxPaise =
      taxPercent > 0 ? roundPaise((taxablePaise * taxPercent) / (100 + taxPercent)) : 0
    totalPaise = taxablePaise
  } else {
    taxPaise = roundPaise((taxablePaise * taxPercent) / 100)
    totalPaise = taxablePaise + taxPaise
  }

  return {
    basePaise,
    discountPaise,
    taxablePaise,
    taxPaise,
    totalPaise: Math.max(0, totalPaise),
  }
}

export function resolveOrderDiscount(
  subtotalAfterLineDiscountPaise: number,
  type: 'none' | 'percent' | 'amount',
  value: number,
): number {
  if (type === 'none' || !Number.isFinite(value) || value <= 0) return 0
  if (type === 'percent') {
    const capped = clamp(value, 0, 100)
    return Math.min(
      subtotalAfterLineDiscountPaise,
      roundPaise((subtotalAfterLineDiscountPaise * capped) / 100),
    )
  }
  return Math.min(subtotalAfterLineDiscountPaise, roundPaise(value))
}

/**
 * Calculates an order. An order-level discount is allocated proportionally
 * across lines for tax purposes (the stored line totals remain pre-order-discount).
 */
export function calculateOrder(
  lines: OrderLine[],
  orderDiscountPaise: number,
  pricesIncludeTax: boolean,
): OrderTotals {
  const calculated = lines.map((line) => ({
    id: line.id,
    ...calculateLine(
      {
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        discountPercent: line.discountPercent,
        taxPercent: line.taxPercent,
      },
      pricesIncludeTax,
    ),
  }))

  const subtotalPaise = calculated.reduce((sum, line) => sum + line.basePaise, 0)
  const lineDiscountPaise = calculated.reduce((sum, line) => sum + line.discountPaise, 0)
  const netBeforeOrderDiscount = Math.max(0, subtotalPaise - lineDiscountPaise)
  const orderDiscount = clamp(
    roundPaise(orderDiscountPaise),
    0,
    netBeforeOrderDiscount,
  )
  const factor =
    netBeforeOrderDiscount > 0
      ? (netBeforeOrderDiscount - orderDiscount) / netBeforeOrderDiscount
      : 0

  const rawTax = calculated.reduce((sum, line) => sum + line.taxPaise, 0)
  const taxPaise = roundPaise(rawTax * factor)
  const totalPaise = pricesIncludeTax
    ? netBeforeOrderDiscount - orderDiscount
    : netBeforeOrderDiscount - orderDiscount + taxPaise

  return {
    subtotalPaise,
    lineDiscountPaise,
    orderDiscountPaise: orderDiscount,
    discountPaise: lineDiscountPaise + orderDiscount,
    taxPaise,
    totalPaise,
    lines: calculated,
  }
}

export function derivePaymentStatus(totalPaise: number, paidPaise: number): PaymentStatus {
  if (paidPaise < 0) return 'refunded'
  if (paidPaise <= 0) return 'unpaid'
  if (paidPaise >= totalPaise) return 'paid'
  return 'partial'
}

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from]?.includes(to) ?? false
}

export const BOOKING_STATUS_FLOW: Record<BookingStatus, BookingStatus[]> = {
  enquiry: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_FLOW[from]?.includes(to) ?? false
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  enquiry: 'Enquiry',
  confirmed: 'Confirmed',
  in_production: 'In production',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** How many stock units a sale of `quantity` consumes. */
export function stockConsumption(quantity: number, conversionFactor?: number): number {
  const safeQty = Number.isFinite(quantity) ? Math.max(0, quantity) : 0
  const factor = conversionFactor && conversionFactor > 0 ? conversionFactor : 1
  return safeQty * factor
}

export interface StockConsumptionLine {
  productId: string
  stockTracked?: boolean
  stockConsumed?: number
}

/**
 * Adds each line's already-calculated stock consumption by product.
 *
 * Order lines stay independent for pricing and notes, but stock is validated
 * and written once per product. Throwing here keeps a non-finite or
 * non-positive consumption value from reaching a Firestore write.
 */
export function aggregateStockConsumption(
  lines: ReadonlyArray<StockConsumptionLine>,
): Map<string, number> {
  const totals = new Map<string, number>()

  for (const line of lines) {
    if (!line.stockTracked) continue
    const consumed = line.stockConsumed
    if (typeof consumed !== 'number' || !Number.isFinite(consumed) || consumed <= 0) {
      throw new Error('An order line has an invalid stock consumption value.')
    }
    const total = (totals.get(line.productId) ?? 0) + consumed
    if (!Number.isFinite(total)) {
      throw new Error('The combined stock consumption for a product is too large.')
    }
    totals.set(line.productId, total)
  }

  return totals
}

export interface StockRestorationLine {
  productId: string
  name: string
  stockTracked?: boolean
  stockConsumed?: number
}

export interface StockRestorationProduct {
  id: string
}

export interface StockRestorationEntry {
  productId: string
  quantity: number
}

/**
 * Works out how much stock to return to each product when a confirmed order is
 * cancelled, using only the immutable snapshots written when the order was
 * created.
 *
 * - `stockTracked === false` lines are skipped: nothing was deducted for them.
 * - `stockTracked` must be present. A missing snapshot means the order cannot
 *   be restored safely, so the cancellation is aborted for manual
 *   reconciliation rather than guessing from current product metadata.
 * - `stockConsumed` must be a finite, positive number for tracked lines.
 * - Multiple lines for the same product are added together so the caller writes
 *   one increment per product.
 * - A missing product record throws instead of under-restoring silently. The
 *   caller runs inside a Firestore transaction, so the throw aborts the whole
 *   cancellation and no partial stock change is committed.
 */
export function stockRestoration(
  lines: ReadonlyArray<StockRestorationLine>,
  products: ReadonlyMap<string, StockRestorationProduct>,
): StockRestorationEntry[] {
  const totals = new Map<string, number>()

  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product) {
      throw new Error(
        `Cannot restore stock for "${line.name}" because its product record no longer exists. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }
    if (typeof line.stockTracked !== 'boolean') {
      throw new Error(
        `Cannot restore stock for "${line.name}" because this order has no saved stock-tracking snapshot. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }
    if (!line.stockTracked) continue

    const consumed = line.stockConsumed
    if (typeof consumed !== 'number' || !Number.isFinite(consumed) || consumed <= 0) {
      throw new Error(
        `Cannot restore stock for "${line.name}" because its saved stock consumption is invalid. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }

    const total = (totals.get(product.id) ?? 0) + consumed
    if (!Number.isFinite(total)) {
      throw new Error(
        `Cannot restore stock for "${line.name}" because the combined saved stock consumption is too large. Reconcile stock manually, then cancel the order. No changes were made.`,
      )
    }
    totals.set(product.id, total)
  }

  return Array.from(totals, ([productId, quantity]) => ({ productId, quantity }))
}
