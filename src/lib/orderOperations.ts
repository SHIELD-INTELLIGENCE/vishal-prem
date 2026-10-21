import { DomainError } from './domainErrors'
import {
  aggregateStockConsumption,
  calculateOrder,
  derivePaymentStatus,
  resolveOrderDiscount,
  stockConsumption,
} from './calculations'
import type {
  Order,
  OrderLine,
  OrderStatus,
  Outlet,
  Product,
  UserProfile,
} from '../types/models'
import type { OrderFormValues } from './validation'

/**
 * Statuses that can only be reached after stock was deducted at creation.
 *
 * `draft` is excluded because the trusted creation path always writes
 * `confirmed`. Cancelling a draft must not restore stock that was never taken.
 */
export const STOCK_DEDUCTED_STATUSES: OrderStatus[] = ['confirmed', 'preparing', 'ready']

export interface BuildOrderArgs {
  values: OrderFormValues
  outlet: Outlet
  pricesIncludeTax: boolean
  profile: UserProfile
  requestId: string
  productMap: ReadonlyMap<string, Product>
  now: string
  orderNumber: string
}

export interface BuiltOrder {
  order: Order
  stockDemand: Map<string, number>
}

/**
 * Builds the authoritative order document and stock demand from trusted
 * product records. This is shared by the legacy browser transaction and the
 * Functions callable so both paths apply exactly the same pricing, snapshot and
 * stock rules.
 */
export function buildOrder({
  values,
  outlet,
  pricesIncludeTax,
  profile,
  requestId,
  productMap,
  now,
  orderNumber,
}: BuildOrderArgs): BuiltOrder {
  if (!values.departmentId) throw new DomainError('Choose a department.')
  if (values.lines.length === 0) throw new DomainError('Add at least one product.')

  const lines: OrderLine[] = values.lines.map((line, index) => {
    const product = productMap.get(line.productId)
    if (!product) {
      throw new DomainError('A selected product no longer exists. Refresh and try again.')
    }
    if (!product.active || !product.available) {
      throw new DomainError(`${product.name} is not available for sale.`)
    }
    if (product.departmentId !== values.departmentId) {
      throw new DomainError(`${product.name} does not belong to the selected department.`)
    }
    if (!product.outletIds.includes(outlet.id)) {
      throw new DomainError(`${product.name} is not sold at this outlet.`)
    }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new DomainError(`Enter a valid quantity for ${product.name}.`)
    }
    const unitPricePaise = Math.round(line.unitPrice * 100)
    if (unitPricePaise <= 0) throw new DomainError(`Enter a valid price for ${product.name}.`)
    if (product.minSalePricePaise && unitPricePaise < product.minSalePricePaise) {
      throw new DomainError(
        `${product.name} cannot be sold below the minimum price of ₹${(product.minSalePricePaise / 100).toFixed(2)}.`,
      )
    }
    const stockTracked = Boolean(product.trackStock)
    let stockFactor: number | undefined
    let stockConsumed = 0
    if (stockTracked) {
      if (
        product.conversionFactor !== undefined &&
        (!Number.isFinite(product.conversionFactor) || product.conversionFactor <= 0)
      ) {
        throw new DomainError(`${product.name} has an invalid stock conversion factor.`)
      }
      stockFactor = product.conversionFactor ?? 1
      // Compute the deduction once and snapshot it on the line. The stock
      // write uses the aggregate of these same values, so the snapshots cannot
      // drift from the quantity actually deducted.
      stockConsumed = stockConsumption(line.quantity, stockFactor)
      if (!Number.isFinite(stockConsumed) || stockConsumed <= 0) {
        throw new DomainError(`${product.name} has an invalid stock consumption value.`)
      }
    }
    return {
      id: `${requestId}-line-${index + 1}`,
      productId: product.id,
      name: product.name,
      printName: product.printName || product.name,
      departmentId: product.departmentId,
      pricingMode: product.pricingMode,
      quantity: line.quantity,
      unit:
        product.pricingMode === 'cake_lb'
          ? 'lb'
          : product.pricingMode === 'per_kg'
            ? 'kg'
            : product.pricingMode === 'per_box'
              ? 'box'
              : product.unit,
      unitPricePaise,
      discountPercent: line.discountPercent,
      taxPercent: product.taxPercent,
      notes: line.notes?.trim() || '',
      stockTracked,
      stockFactor,
      stockConsumed,
    }
  })

  const stockDemand = aggregateStockConsumption(lines)
  for (const [productId, quantity] of stockDemand) {
    const product = productMap.get(productId)
    if (!product) {
      throw new DomainError('A selected product no longer exists. Refresh and try again.')
    }
    const available = product.stockQty
    if (typeof available !== 'number' || !Number.isFinite(available)) {
      throw new DomainError(`${product.name} has an invalid stock quantity.`)
    }
    if (quantity > available) {
      throw new DomainError(`${product.name} has only ${available} ${product.unit} in stock.`)
    }
  }

  const subtotalAfterLineDiscount = lines.reduce((sum, line) => {
    const base = Math.round(line.quantity * line.unitPricePaise)
    return sum + base - Math.round((base * line.discountPercent) / 100)
  }, 0)

  const orderDiscountPaise = resolveOrderDiscount(
    subtotalAfterLineDiscount,
    values.discountType,
    values.discountType === 'amount'
      ? Math.round(values.discountValue * 100)
      : values.discountValue,
  )
  const totals = calculateOrder(lines, orderDiscountPaise, pricesIncludeTax)
  const advancePaise = Math.round(values.advanceAmount * 100)
  if (!Number.isFinite(advancePaise) || advancePaise < 0) {
    throw new DomainError('Enter a valid advance amount.')
  }
  if (advancePaise > totals.totalPaise) {
    throw new DomainError('The advance cannot be greater than the order total.')
  }
  const paidPaise = Math.min(advancePaise, totals.totalPaise)

  let pickupAt: string | undefined
  if (values.pickupAt) {
    const pickup = new Date(values.pickupAt)
    if (Number.isNaN(pickup.getTime())) {
      throw new DomainError('Enter a valid pickup date and time.')
    }
    pickupAt = pickup.toISOString()
  }

  const order: Order = {
    id: requestId,
    orderNumber,
    outletId: outlet.id,
    departmentId: values.departmentId,
    customerId: values.customerId || undefined,
    customerName: values.customerName.trim(),
    customerPhone: values.customerPhone?.replace(/\D/g, '').slice(-10) || '',
    channel: values.channel,
    orderType: values.orderType,
    status: 'confirmed',
    paymentStatus: derivePaymentStatus(totals.totalPaise, paidPaise),
    lines,
    subtotalPaise: totals.subtotalPaise,
    lineDiscountPaise: totals.lineDiscountPaise,
    orderDiscountPaise: totals.orderDiscountPaise,
    discountPaise: totals.discountPaise,
    taxPaise: totals.taxPaise,
    totalPaise: totals.totalPaise,
    paidPaise,
    balancePaise: totals.totalPaise - paidPaise,
    pricesIncludeTax,
    discountType: values.discountType,
    discountValue: values.discountValue,
    revision: 1,
    notes: values.notes?.trim() || '',
    pickupAt,
    printCounts: { receipt: 0, kitchen: 0, packing: 0, invoice: 0 },
    createdAt: now,
    updatedAt: now,
    createdBy: profile.uid,
    updatedBy: profile.uid,
  }

  return { order, stockDemand }
}
