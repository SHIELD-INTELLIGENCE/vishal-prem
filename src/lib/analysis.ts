import type {
  Booking,
  Customer,
  Order,
  OrderLine,
  Payment,
  Purchase,
} from '@/types/models'
import { buildPartyStatement } from '@/lib/partyLedger'

/**
 * Sales, purchase, item and party analysis.
 *
 * Sales value is the amount actually charged on non-cancelled orders and
 * bookings. Taxable sales strip GST only when the document says prices include
 * tax. Order-level discounts are allocated across lines in proportion to line
 * value so item totals reconcile to the document total.
 *
 * Purchase figures come from posted vouchers only. The period margin shown is
 * taxable sales minus taxable purchases. It is not a cost-of-goods-sold margin:
 * purchases received in the period may still be in stock.
 */

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function roundPaise(value: number): number {
  return Math.round(value + Number.EPSILON)
}

interface LineValue {
  grossPaise: number
  taxablePaise: number
  taxPaise: number
}

function lineValue(line: OrderLine, orderDiscountPaise: number, totalLineBasePaise: number, pricesIncludeTax: boolean): LineValue {
  const base = line.quantity * line.unitPricePaise
  const lineDiscount = roundPaise((base * line.discountPercent) / 100)
  const net = Math.max(0, base - lineDiscount)
  const share = totalLineBasePaise > 0
    ? roundPaise((orderDiscountPaise * net) / totalLineBasePaise)
    : 0
  const afterOrderDiscount = Math.max(0, net - share)

  if (pricesIncludeTax && line.taxPercent > 0) {
    const taxablePaise = roundPaise((afterOrderDiscount * 100) / (100 + line.taxPercent))
    return {
      grossPaise: roundPaise(afterOrderDiscount),
      taxablePaise,
      taxPaise: roundPaise(afterOrderDiscount) - taxablePaise,
    }
  }

  return {
    grossPaise: roundPaise(afterOrderDiscount),
    taxablePaise: roundPaise(afterOrderDiscount),
    taxPaise: roundPaise((afterOrderDiscount * line.taxPercent) / 100),
  }
}

function documentLineBase(lines: OrderLine[]): number {
  return lines.reduce((sum, line) => {
    const base = line.quantity * line.unitPricePaise
    return sum + Math.max(0, base - roundPaise((base * line.discountPercent) / 100))
  }, 0)
}

export interface ItemAnalysisRow {
  key: string
  itemType: 'product' | 'inventory'
  name: string
  unit: string
  departmentId: string
  quantitySold: number
  grossSalesPaise: number
  taxableSalesPaise: number
  taxPaise: number
  quantityPurchased: number
  taxablePurchasePaise: number
  /** Only set when the same product has both sales and purchases in the period. */
  marginPaise: number | null
  marginPercent: number | null
}

export function buildItemAnalysis({
  orders,
  bookings,
  purchases,
}: {
  orders: Order[]
  bookings: Booking[]
  purchases: Purchase[]
}): ItemAnalysisRow[] {
  const map = new Map<string, ItemAnalysisRow>()

  function ensure(key: string, itemType: 'product' | 'inventory', name: string, unit: string, departmentId: string): ItemAnalysisRow {
    const existing = map.get(key)
    if (existing) return existing
    const row: ItemAnalysisRow = {
      key,
      itemType,
      name,
      unit,
      departmentId,
      quantitySold: 0,
      grossSalesPaise: 0,
      taxableSalesPaise: 0,
      taxPaise: 0,
      quantityPurchased: 0,
      taxablePurchasePaise: 0,
      marginPaise: null,
      marginPercent: null,
    }
    map.set(key, row)
    return row
  }

  function addSales(document: Order | Booking): void {
    if (document.status === 'cancelled') return
    const totalBase = documentLineBase(document.lines)
    for (const line of document.lines) {
      const value = lineValue(line, document.orderDiscountPaise, totalBase, document.pricesIncludeTax)
      const row = ensure(`product:${line.productId}`, 'product', line.name, line.unit, line.departmentId)
      row.quantitySold = round(row.quantitySold + line.quantity)
      row.grossSalesPaise += value.grossPaise
      row.taxableSalesPaise += value.taxablePaise
      row.taxPaise += value.taxPaise
    }
  }

  for (const order of orders) addSales(order)
  for (const booking of bookings) addSales(booking)

  for (const purchase of purchases) {
    if (purchase.status !== 'posted') continue
    for (const line of purchase.lines) {
      const key = `${line.itemType === 'product' ? 'product' : 'inventory'}:${line.itemId}`
      const row = ensure(key, line.itemType === 'product' ? 'product' : 'inventory', line.name, line.unit, purchase.departmentId)
      row.quantityPurchased = round(row.quantityPurchased + line.quantity)
      row.taxablePurchasePaise += line.taxablePaise
    }
  }

  return Array.from(map.values())
    .map((row) => {
      const hasBoth = row.quantitySold > 0 && row.quantityPurchased > 0
      const marginPaise = hasBoth ? row.taxableSalesPaise - row.taxablePurchasePaise : null
      return {
        ...row,
        marginPaise,
        marginPercent:
          marginPaise !== null && row.taxableSalesPaise > 0
            ? Math.round((marginPaise / row.taxableSalesPaise) * 1000) / 10
            : null,
      }
    })
    .sort((a, b) => b.taxableSalesPaise - a.taxableSalesPaise || b.taxablePurchasePaise - a.taxablePurchasePaise)
}

export interface PartyAnalysisRow {
  customerId: string
  name: string
  phone: string
  group: string
  documents: number
  billedPaise: number
  receivedPaise: number
  balancePaise: number
  averageBillPaise: number | null
  lastActivityAt: string | null
}

export function buildPartyAnalysis({
  customers,
  orders,
  bookings,
  payments,
}: {
  customers: Customer[]
  orders: Order[]
  bookings: Booking[]
  payments: Payment[]
}): PartyAnalysisRow[] {
  return customers
    .map((customer) => {
      const statement = buildPartyStatement(customer, orders, bookings, payments)
      const documents = [
        ...orders.filter((order) => order.customerId === customer.id && order.status !== 'cancelled'),
        ...bookings.filter((booking) => booking.customerId === customer.id && booking.status !== 'cancelled'),
      ]
      const customerPayments = payments.filter((payment) => payment.customerId === customer.id)
      const timestamps = [
        ...documents.map((document) => document.createdAt),
        ...customerPayments.map((payment) => payment.createdAt),
      ].filter(Boolean)
      const lastActivityAt = timestamps.length > 0
        ? timestamps.reduce((latest, value) => (value > latest ? value : latest))
        : null

      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        group: customer.accountGroup,
        documents: documents.length,
        billedPaise: statement.billedPaise,
        receivedPaise: statement.receivedPaise,
        balancePaise: statement.closingBalancePaise,
        averageBillPaise: documents.length > 0 ? roundPaise(statement.billedPaise / documents.length) : null,
        lastActivityAt,
      }
    })
    .filter((row) => row.documents > 0 || row.billedPaise !== 0 || row.receivedPaise !== 0)
    .sort((a, b) => b.billedPaise - a.billedPaise || b.balancePaise - a.balancePaise)
}

export interface AnalysisSummary {
  orders: number
  salesPaise: number
  taxableSalesPaise: number
  taxPaise: number
  purchaseVouchers: number
  purchasesPaise: number
  taxablePurchasePaise: number
  inputTaxPaise: number
  periodMarginPaise: number | null
  periodMarginPercent: number | null
  averageOrderPaise: number | null
  itemsSold: number
}

export function buildAnalysisSummary({
  orders,
  bookings,
  purchases,
  itemRows,
}: {
  orders: Order[]
  bookings: Booking[]
  purchases: Purchase[]
  itemRows: ItemAnalysisRow[]
}): AnalysisSummary {
  const activeOrders = orders.filter((order) => order.status !== 'cancelled')
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled')
  const postedPurchases = purchases.filter((purchase) => purchase.status === 'posted')

  const salesPaise =
    activeOrders.reduce((sum, order) => sum + order.totalPaise, 0)
    + activeBookings.reduce((sum, booking) => sum + booking.totalPaise, 0)
  const taxableSalesPaise = itemRows.reduce((sum, row) => sum + row.taxableSalesPaise, 0)
  const taxPaise = itemRows.reduce((sum, row) => sum + row.taxPaise, 0)
  const purchasesPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.totalPaise, 0)
  const taxablePurchasePaise = postedPurchases.reduce((sum, purchase) => sum + purchase.taxablePaise, 0)
  const inputTaxPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.taxPaise, 0)
  const documentCount = activeOrders.length + activeBookings.length
  const periodMarginPaise = taxableSalesPaise - taxablePurchasePaise

  return {
    orders: documentCount,
    salesPaise,
    taxableSalesPaise,
    taxPaise,
    purchaseVouchers: postedPurchases.length,
    purchasesPaise,
    taxablePurchasePaise,
    inputTaxPaise,
    periodMarginPaise,
    periodMarginPercent:
      taxableSalesPaise > 0
        ? Math.round((periodMarginPaise / taxableSalesPaise) * 1000) / 10
        : null,
    averageOrderPaise: documentCount > 0 ? roundPaise(salesPaise / documentCount) : null,
    itemsSold: round(itemRows.reduce((sum, row) => sum + row.quantitySold, 0)),
  }
}
