import type { Booking, Order, Purchase, PurchaseTaxTreatment } from '@/types/models'

/**
 * GST and accounting working reports.
 *
 * These are derived from posted documents, not from a general ledger. The
 * application does not keep a chart of accounts or double-entry journals, so
 * this module reports the GST working position and explicitly documents what
 * is still required before a trial balance or a statutory return can be
 * produced. It never fabricates the missing side of an entry.
 *
 * Outward supplies do not store the customer's place of supply, so outward tax
 * is reported as one figure. Splitting it into CGST/SGST and IGST would require
 * data the orders do not contain.
 */

function roundPaise(value: number): number {
  return Math.round(value + Number.EPSILON)
}

export interface GstSummary {
  outwardDocuments: number
  outwardTaxablePaise: number
  outwardTaxPaise: number
  inwardDocuments: number
  inwardTaxablePaise: number
  inwardTaxPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  rcmTaxPaise: number
  itcClaimablePaise: number
  /** Outward tax minus claimable input tax. Negative means a credit position. */
  netWorkingPositionPaise: number
}

export function buildGstSummary({
  orders,
  bookings,
  purchases,
}: {
  orders: Order[]
  bookings: Booking[]
  purchases: Purchase[]
}): GstSummary {
  const activeOrders = orders.filter((order) => order.status !== 'cancelled')
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled')
  const postedPurchases = purchases.filter((purchase) => purchase.status === 'posted')

  const outwardTaxablePaise =
    activeOrders.reduce((sum, order) => sum + Math.max(0, order.totalPaise - order.taxPaise), 0)
    + activeBookings.reduce((sum, booking) => sum + Math.max(0, booking.totalPaise - booking.taxPaise), 0)
  const outwardTaxPaise =
    activeOrders.reduce((sum, order) => sum + order.taxPaise, 0)
    + activeBookings.reduce((sum, booking) => sum + booking.taxPaise, 0)

  const inwardTaxablePaise = postedPurchases.reduce((sum, purchase) => sum + purchase.taxablePaise, 0)
  const inwardTaxPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.taxPaise, 0)
  const cgstPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.cgstPaise, 0)
  const sgstPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.sgstPaise, 0)
  const igstPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.igstPaise, 0)
  const rcmTaxPaise = postedPurchases.reduce((sum, purchase) => sum + purchase.rcmTaxPaise, 0)
  const itcClaimablePaise = postedPurchases
    .filter((purchase) => purchase.itcClaimable)
    .reduce((sum, purchase) => sum + purchase.taxPaise, 0)

  return {
    outwardDocuments: activeOrders.length + activeBookings.length,
    outwardTaxablePaise: roundPaise(outwardTaxablePaise),
    outwardTaxPaise: roundPaise(outwardTaxPaise),
    inwardDocuments: postedPurchases.length,
    inwardTaxablePaise: roundPaise(inwardTaxablePaise),
    inwardTaxPaise: roundPaise(inwardTaxPaise),
    cgstPaise: roundPaise(cgstPaise),
    sgstPaise: roundPaise(sgstPaise),
    igstPaise: roundPaise(igstPaise),
    rcmTaxPaise: roundPaise(rcmTaxPaise),
    itcClaimablePaise: roundPaise(itcClaimablePaise),
    netWorkingPositionPaise: roundPaise(outwardTaxPaise - itcClaimablePaise),
  }
}

export interface TreatmentRow {
  treatment: PurchaseTaxTreatment
  documents: number
  taxablePaise: number
  taxPaise: number
  rcmTaxPaise: number
  itcClaimablePaise: number
}

export function buildTreatmentSummary(purchases: Purchase[]): TreatmentRow[] {
  const map = new Map<PurchaseTaxTreatment, TreatmentRow>()
  for (const purchase of purchases) {
    if (purchase.status !== 'posted') continue
    const row = map.get(purchase.taxTreatment) ?? {
      treatment: purchase.taxTreatment,
      documents: 0,
      taxablePaise: 0,
      taxPaise: 0,
      rcmTaxPaise: 0,
      itcClaimablePaise: 0,
    }
    row.documents += 1
    row.taxablePaise += purchase.taxablePaise
    row.taxPaise += purchase.taxPaise
    row.rcmTaxPaise += purchase.rcmTaxPaise
    if (purchase.itcClaimable) row.itcClaimablePaise += purchase.taxPaise
    map.set(purchase.taxTreatment, row)
  }
  return Array.from(map.values()).sort((a, b) => b.taxablePaise - a.taxablePaise)
}

export interface HsnRow {
  hsn: string
  description: string
  quantity: number
  taxablePaise: number
  taxPaise: number
}

/**
 * Purchase-side HSN summary. Outward HSN is not available because order lines
 * store the product name and tax rate but not the HSN code.
 */
export function buildPurchaseHsnSummary(purchases: Purchase[]): HsnRow[] {
  const map = new Map<string, HsnRow>()
  for (const purchase of purchases) {
    if (purchase.status !== 'posted') continue
    for (const line of purchase.lines) {
      const key = line.hsn?.trim() || 'Unspecified'
      const row = map.get(key) ?? {
        hsn: key,
        description: line.name,
        quantity: 0,
        taxablePaise: 0,
        taxPaise: 0,
      }
      row.quantity = Math.round((row.quantity + line.quantity + Number.EPSILON) * 1_000_000) / 1_000_000
      row.taxablePaise += line.taxablePaise
      row.taxPaise += line.taxPaise
      map.set(key, row)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.taxablePaise - a.taxablePaise)
}

export interface SupplierTaxRow {
  supplierId: string
  supplierName: string
  documents: number
  taxablePaise: number
  taxPaise: number
  rcmTaxPaise: number
  payablePaise: number
}

export function buildSupplierTaxSummary(purchases: Purchase[]): SupplierTaxRow[] {
  const map = new Map<string, SupplierTaxRow>()
  for (const purchase of purchases) {
    if (purchase.status !== 'posted') continue
    const key = purchase.supplierId || 'stock-transfer'
    const row = map.get(key) ?? {
      supplierId: key,
      supplierName: purchase.supplierName,
      documents: 0,
      taxablePaise: 0,
      taxPaise: 0,
      rcmTaxPaise: 0,
      payablePaise: 0,
    }
    row.documents += 1
    row.taxablePaise += purchase.taxablePaise
    row.taxPaise += purchase.taxPaise
    row.rcmTaxPaise += purchase.rcmTaxPaise
    row.payablePaise += purchase.payablePaise
    map.set(key, row)
  }
  return Array.from(map.values()).sort((a, b) => b.taxablePaise - a.taxablePaise)
}

export interface TaxRateRow {
  taxPercent: number
  documents: number
  taxablePaise: number
  taxPaise: number
}

export function buildPurchaseTaxRateSummary(purchases: Purchase[]): TaxRateRow[] {
  const map = new Map<number, TaxRateRow>()
  for (const purchase of purchases) {
    if (purchase.status !== 'posted') continue
    for (const line of purchase.lines) {
      const rate = Math.round(line.taxPercent * 1000) / 1000
      const row = map.get(rate) ?? { taxPercent: rate, documents: 0, taxablePaise: 0, taxPaise: 0 }
      row.documents += 1
      row.taxablePaise += line.taxablePaise
      row.taxPaise += line.taxPaise
      map.set(rate, row)
    }
  }
  return Array.from(map.values()).sort((a, b) => a.taxPercent - b.taxPercent)
}

/**
 * Shown verbatim on the GST and accounting report. These are real gaps, not
 * caveats added for appearance.
 */
export const ACCOUNTING_PREREQUISITES: string[] = [
  'There is no chart of accounts, journal, or double-entry ledger, so a trial balance cannot be produced from this application.',
  'Sales and purchases are commercial documents. They are not yet posted to ledger accounts such as cash, bank, debtors, creditors, input tax credit or output tax.',
  'Expenses are recorded operationally, but asset, liability and capital balances are not maintained as accounts.',
  'Opening balances exist for customers and can be used for supplier payables, but other opening balances are not captured in a ledger.',
  'GST returns require outward place-of-supply, HSN summaries for sales, document series and amendment tracking. Outward HSN and place of supply are not stored on orders.',
  'The net GST figure here is a working position from posted documents, not a filed return or a statutory computation.',
  'Bank reconciliation, TDS, e-invoice and e-way bill data are outside this build.',
]
