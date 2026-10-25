/**
 * GST calculation for purchase vouchers.
 *
 * Every amount is integer paise. Quantities may be fractional (kg, litres) and
 * are rounded to six decimal places before multiplication so repeated edits do
 * not accumulate binary floating-point drift.
 *
 * The tax treatment is never inferred from a percentage:
 *
 *   regular          tax charged by the supplier, split by place of supply
 *   exempt           no tax because the goods are exempt
 *   nil_rated        GST rate is nil (0%) by notification
 *   zero_rated       zero-rated supply (for example an export)
 *   reverse_charge   supplier charges no tax; the buyer records the liability
 *   stock_transfer   internal movement, not a supplier purchase
 *
 * Exempt, nil-rated and zero-rated are different statutory categories even
 * though all three produce zero tax. They are stored as entered and reported
 * separately.
 */

import type {
  GstSupplyType,
  Purchase,
  PurchaseTaxTreatment,
  SupplierPayment,
} from '@/types/models'

export const GST_TREATMENT_LABELS: Record<PurchaseTaxTreatment, string> = {
  regular: 'Regular (tax charged by supplier)',
  exempt: 'Exempt supply',
  nil_rated: 'Nil-rated',
  zero_rated: 'Zero-rated',
  reverse_charge: 'Reverse charge',
  stock_transfer: 'Stock transfer (no supplier invoice)',
}

export const SUPPLY_TYPE_LABELS: Record<GstSupplyType, string> = {
  intra_state: 'Intra-state (CGST + SGST)',
  inter_state: 'Inter-state (IGST)',
}

export const PURCHASE_TAX_TREATMENTS: PurchaseTaxTreatment[] = [
  'regular',
  'exempt',
  'nil_rated',
  'zero_rated',
  'reverse_charge',
  'stock_transfer',
]

export function isTaxableTreatment(treatment: PurchaseTaxTreatment): boolean {
  return treatment === 'regular' || treatment === 'reverse_charge'
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function roundPaise(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value + Number.EPSILON)
}

export interface GstLineInput {
  quantity: number
  ratePaise: number
  discountPercent: number
  taxPercent: number
  taxInclusive: boolean
  treatment: PurchaseTaxTreatment
  supplyType: GstSupplyType
}

export interface GstLineResult {
  /** Quantity × rate before discount. */
  grossPaise: number
  discountPaise: number
  /** Gross minus discount. When the rate includes tax this still includes it. */
  netPaise: number
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  /** Taxable value plus tax charged on the invoice. */
  totalPaise: number
  /** Reverse-charge tax is the buyer's liability, not payable to the supplier. */
  rcmTaxPaise: number
  /** Amount owed to the supplier for this line. */
  payablePaise: number
}

export function computePurchaseLine(input: GstLineInput): GstLineResult {
  const quantity = round(Math.max(0, input.quantity), 6)
  const ratePaise = Math.max(0, roundPaise(input.ratePaise))
  const discountPercent = Math.min(100, Math.max(0, round(input.discountPercent, 3)))
  const enteredTaxPercent = Math.min(100, Math.max(0, round(input.taxPercent, 3)))
  const taxPercent = isTaxableTreatment(input.treatment) ? enteredTaxPercent : 0

  const grossPaise = roundPaise(quantity * ratePaise)
  const discountPaise = roundPaise((grossPaise * discountPercent) / 100)
  const netPaise = Math.max(0, grossPaise - discountPaise)

  let taxablePaise = netPaise
  let taxPaise = 0

  if (taxPercent > 0) {
    if (input.taxInclusive) {
      taxablePaise = roundPaise((netPaise * 100) / (100 + taxPercent))
      taxPaise = netPaise - taxablePaise
    } else {
      taxPaise = roundPaise((netPaise * taxPercent) / 100)
    }
  }

  let cgstPaise = 0
  let sgstPaise = 0
  let igstPaise = 0
  if (input.supplyType === 'inter_state') {
    igstPaise = taxPaise
  } else {
    cgstPaise = roundPaise(taxPaise / 2)
    sgstPaise = taxPaise - cgstPaise
  }

  const totalPaise = taxablePaise + taxPaise
  const rcmTaxPaise = input.treatment === 'reverse_charge' ? taxPaise : 0
  const payablePaise = input.treatment === 'stock_transfer'
    ? 0
    : input.treatment === 'reverse_charge'
      ? taxablePaise
      : totalPaise

  return {
    grossPaise,
    discountPaise,
    netPaise,
    taxablePaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalPaise,
    rcmTaxPaise,
    payablePaise,
  }
}

export interface PurchaseTotals {
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  taxPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  rcmTaxPaise: number
  totalPaise: number
  payablePaise: number
}

export function purchaseTotals(lines: GstLineResult[]): PurchaseTotals {
  return lines.reduce<PurchaseTotals>(
    (acc, line) => ({
      subtotalPaise: acc.subtotalPaise + line.grossPaise,
      discountPaise: acc.discountPaise + line.discountPaise,
      taxablePaise: acc.taxablePaise + line.taxablePaise,
      taxPaise: acc.taxPaise + line.taxPaise,
      cgstPaise: acc.cgstPaise + line.cgstPaise,
      sgstPaise: acc.sgstPaise + line.sgstPaise,
      igstPaise: acc.igstPaise + line.igstPaise,
      rcmTaxPaise: acc.rcmTaxPaise + line.rcmTaxPaise,
      totalPaise: acc.totalPaise + line.totalPaise,
      payablePaise: acc.payablePaise + line.payablePaise,
    }),
    {
      subtotalPaise: 0,
      discountPaise: 0,
      taxablePaise: 0,
      taxPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      rcmTaxPaise: 0,
      totalPaise: 0,
      payablePaise: 0,
    },
  )
}

/**
 * Place of supply is determined by the supplier's state against the business
 * state. Unknown states cannot be inferred; the operator's explicit choice is
 * then used and reported as unverified.
 */
export function deriveSupplyType(
  businessState: string | undefined,
  supplierState: string | undefined,
  fallback: GstSupplyType = 'intra_state',
): GstSupplyType {
  const business = businessState?.trim().toLowerCase()
  const supplier = supplierState?.trim().toLowerCase()
  if (!business || !supplier) return fallback
  return business === supplier ? 'intra_state' : 'inter_state'
}

/* --------------------------------------------------------------------------
 * Supplier balances
 * ------------------------------------------------------------------------ */

export interface SupplierLedgerEntry {
  id: string
  date: string
  type: 'opening' | 'purchase' | 'payment'
  reference: string
  debitPaise: number
  creditPaise: number
  balancePaise: number
}

export interface SupplierLedger {
  supplierId: string
  supplierName: string
  openingPaise: number
  purchasedPaise: number
  paidPaise: number
  /** Positive means the business owes the supplier. */
  outstandingPaise: number
  entries: SupplierLedgerEntry[]
}

/**
 * Builds a supplier statement from posted purchases and posted supplier
 * payments. Cancelled vouchers and voided payments are excluded. A supplier's
 * opening balance is treated as an opening payable, matching how the party
 * opening balance is used for customers.
 */
export function buildSupplierLedger({
  supplierId,
  supplierName,
  openingBalancePaise,
  purchases,
  payments,
}: {
  supplierId: string
  supplierName: string
  openingBalancePaise: number
  purchases: Purchase[]
  payments: SupplierPayment[]
}): SupplierLedger {
  const entries: Array<Omit<SupplierLedgerEntry, 'balancePaise'>> = []

  if (openingBalancePaise !== 0) {
    entries.push({
      id: 'opening',
      date: '',
      type: 'opening',
      reference: 'Opening balance',
      debitPaise: 0,
      creditPaise: openingBalancePaise,
    })
  }

  for (const purchase of purchases) {
    if (purchase.supplierId !== supplierId) continue
    if (purchase.status !== 'posted') continue
    entries.push({
      id: purchase.id,
      date: purchase.receivedAt,
      type: 'purchase',
      reference: `${purchase.purchaseNumber} · invoice ${purchase.invoiceNumber}`,
      debitPaise: 0,
      creditPaise: purchase.payablePaise,
    })
  }

  for (const payment of payments) {
    if (payment.supplierId !== supplierId) continue
    if (payment.status !== 'posted') continue
    entries.push({
      id: payment.id,
      date: payment.paidAt,
      type: 'payment',
      reference: payment.paymentNumber,
      debitPaise: payment.amountPaise,
      creditPaise: 0,
    })
  }

  entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let balance = 0
  const withBalance: SupplierLedgerEntry[] = entries.map((entry) => {
    balance += entry.creditPaise - entry.debitPaise
    return { ...entry, balancePaise: balance }
  })

  const purchasedPaise = purchases
    .filter((purchase) => purchase.supplierId === supplierId && purchase.status === 'posted')
    .reduce((sum, purchase) => sum + purchase.payablePaise, 0)
  const paidPaise = payments
    .filter((payment) => payment.supplierId === supplierId && payment.status === 'posted')
    .reduce((sum, payment) => sum + payment.amountPaise, 0)

  return {
    supplierId,
    supplierName,
    openingPaise: openingBalancePaise,
    purchasedPaise,
    paidPaise,
    outstandingPaise: openingBalancePaise + purchasedPaise - paidPaise,
    entries: withBalance,
  }
}
