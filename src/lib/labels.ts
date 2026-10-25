/**
 * Label printing and accountability domain logic.
 *
 * No Firebase imports. This module is shared by the browser, the trusted
 * backend and the tests so a print job, its reconciliation and the dashboard
 * can never disagree about arithmetic.
 *
 * The core rule is deliberately strict:
 *
 *   confirmed printed = applied + damaged + returned unused + unaccounted
 *
 * Nothing is ever moved between categories automatically. A browser print
 * dialog, a sale or a scan does not create physical label usage.
 */

import type {
  LabelEvent,
  LabelJobLine,
  LabelPrintJob,
  LabelTemplateSnapshot,
  LabelType,
  LabelUsageCategory,
} from '@/types/models'

/* --------------------------------------------------------------------------
 * Code 128 barcode encoding (subset B)
 * ------------------------------------------------------------------------ */

/**
 * Bar/space widths for Code 128 values 0–106. Digits alternate bar and space,
 * starting with a bar. The stop pattern (106) is 13 modules; every other
 * symbol is 11 modules.
 */
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213',
  '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231',
  '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123',
  '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121',
  '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121',
  '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214',
  '211232', '2331112',
] as const

const START_B = 104
const STOP = 106
const MAX_BARCODE_LENGTH = 48
const QUIET_ZONE_MODULES = 10

export interface EncodedBarcode {
  /** Full module string including quiet zones; `1` is a bar, `0` a space. */
  modules: string
  checksum: number
  symbols: number[]
}

function patternModules(pattern: string): string {
  let modules = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const width = Number(pattern[index])
    modules += (index % 2 === 0 ? '1' : '0').repeat(width)
  }
  return modules
}

/**
 * Encodes a value in Code 128 subset B. The value must be printable ASCII
 * (32–126). The result is a structurally valid symbol stream: start code,
 * data values, modulo-103 checksum and stop pattern, framed by a 10-module
 * quiet zone on each side.
 */
export function encodeCode128B(value: string): EncodedBarcode {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('A barcode value is required.')
  }
  if (value.length > MAX_BARCODE_LENGTH) {
    throw new Error(`Barcode values are limited to ${MAX_BARCODE_LENGTH} characters.`)
  }

  const symbols: number[] = [START_B]
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 || code > 126) {
      throw new Error('Barcode values may only contain printable ASCII characters.')
    }
    symbols.push(code - 32)
  }

  let sum = START_B
  for (let index = 1; index < symbols.length; index += 1) {
    sum += symbols[index] * index
  }
  const checksum = sum % 103
  symbols.push(checksum, STOP)

  const quiet = '0'.repeat(QUIET_ZONE_MODULES)
  const payload = symbols.map((symbol) => patternModules(CODE128_PATTERNS[symbol])).join('')
  return { modules: `${quiet}${payload}${quiet}`, checksum, symbols }
}

/** Ceiling on the number of label copies one job may produce. */
export const MAX_LABEL_JOB_QUANTITY = 5000
export const MAX_LABEL_LINE_QUANTITY = 500

/* --------------------------------------------------------------------------
 * Layout defaults
 * ------------------------------------------------------------------------ */

export const LABEL_DIMENSION_LIMITS = {
  widthMm: { min: 25, max: 150 },
  heightMm: { min: 10, max: 100 },
  marginMm: { min: 0, max: 10 },
  columns: { min: 1, max: 4 },
} as const

export function defaultLabelTemplate(type: LabelType): LabelTemplateSnapshot {
  if (type === 'account') {
    return {
      name: 'Account label',
      type,
      widthMm: 50,
      heightMm: 30,
      marginMm: 1,
      columns: 2,
      showName: true,
      showSku: true,
      showPrice: false,
      showMrp: false,
      showAddress: true,
      showPhone: true,
      showUnit: false,
      showBatch: false,
      showMfgDate: false,
      showExpiryDate: false,
      barcodeFormat: 'code128',
    }
  }
  return {
    name: 'Item label',
    type,
    widthMm: 38,
    heightMm: 25,
    marginMm: 1,
    columns: 3,
    showName: true,
    showSku: true,
    showPrice: true,
    showMrp: true,
    showAddress: false,
    showPhone: false,
    showUnit: true,
    showBatch: false,
    showMfgDate: false,
    showExpiryDate: false,
    barcodeFormat: 'code128',
  }
}

/* --------------------------------------------------------------------------
 * Quantity reconciliation
 * ------------------------------------------------------------------------ */

export interface LabelLineReconciliation {
  lineId: string
  printed: number
  applied: number
  damaged: number
  returned: number
  accounted: number
  unaccounted: number
  /** Labels that can still be recorded as applied, damaged or returned. */
  available: number
  applicationRate: number | null
}

export interface LabelTotals {
  printed: number
  applied: number
  damaged: number
  returned: number
  accounted: number
  unaccounted: number
  applicationRate: number | null
}

function safeQty(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.round(value * 1_000_000) / 1_000_000
}

function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

export function reconcileLabelLine(line: LabelJobLine): LabelLineReconciliation {
  const printed = Math.max(0, safeQty(line.printedQty))
  const applied = Math.max(0, safeQty(line.appliedQty))
  const damaged = Math.max(0, safeQty(line.damagedQty))
  const returned = Math.max(0, safeQty(line.returnedQty))
  const accounted = applied + damaged + returned
  const unaccounted = Math.max(0, printed - accounted)
  return {
    lineId: line.lineId,
    printed,
    applied,
    damaged,
    returned,
    accounted,
    unaccounted,
    available: Math.max(0, printed - accounted),
    applicationRate: rate(applied, printed),
  }
}

export function labelTotals(lines: LabelJobLine[]): LabelTotals {
  let printed = 0
  let applied = 0
  let damaged = 0
  let returned = 0
  for (const line of lines) {
    const row = reconcileLabelLine(line)
    printed += row.printed
    applied += row.applied
    damaged += row.damaged
    returned += row.returned
  }
  const accounted = applied + damaged + returned
  return {
    printed,
    applied,
    damaged,
    returned,
    accounted,
    unaccounted: Math.max(0, printed - accounted),
    applicationRate: rate(applied, printed),
  }
}

/**
 * Rebuilds per-line totals from the immutable ledger. This is the audit view:
 * the job document caches the same numbers, and this function proves them.
 *
 * A `voided` event cancels the print event it references. The original event
 * is never edited, so the history remains complete.
 */
export function computeLabelLedger(
  lines: LabelJobLine[],
  events: LabelEvent[],
): { lines: LabelLineReconciliation[]; totals: LabelTotals } {
  const voidedIds = new Set(
    events
      .filter((event) => event.kind === 'voided' && event.voidsEventId)
      .map((event) => event.voidsEventId as string),
  )

  const printed = new Map<string, number>()
  const categories = new Map<string, Record<LabelUsageCategory, number>>()

  const categoryFor = (lineId: string) => {
    const current = categories.get(lineId) ?? { applied: 0, damaged: 0, returned: 0 }
    categories.set(lineId, current)
    return current
  }

  for (const event of events) {
    if (event.kind === 'confirmed' || event.kind === 'reprinted') {
      if (voidedIds.has(event.id)) continue
      for (const line of event.lines) {
        printed.set(line.lineId, (printed.get(line.lineId) ?? 0) + safeQty(line.quantity))
      }
      continue
    }
    if (event.kind !== 'usage' && event.kind !== 'adjusted') continue
    if (!event.lineId || !event.category) continue
    const bucket = categoryFor(event.lineId)
    bucket[event.category] += safeQty(event.quantity)
  }

  const reconciled = lines.map((line) => {
    const bucket = categories.get(line.lineId) ?? { applied: 0, damaged: 0, returned: 0 }
    return reconcileLabelLine({
      ...line,
      printedQty: Math.max(0, printed.get(line.lineId) ?? 0),
      appliedQty: Math.max(0, bucket.applied),
      damagedQty: Math.max(0, bucket.damaged),
      returnedQty: Math.max(0, bucket.returned),
    })
  })

  return {
    lines: reconciled,
    totals: labelTotals(
      reconciled.map((row, index) => ({
        ...lines[index],
        printedQty: row.printed,
        appliedQty: row.applied,
        damagedQty: row.damaged,
        returnedQty: row.returned,
      })),
    ),
  }
}

/**
 * Validates that a proposed category change cannot exceed the confirmed
 * printed quantity or drive a category below zero.
 */
export function labelQuantityError({
  printed,
  applied,
  damaged,
  returned,
}: {
  printed: number
  applied: number
  damaged: number
  returned: number
}): string | null {
  if ([printed, applied, damaged, returned].some((value) => !Number.isFinite(value))) {
    return 'Label quantities must be finite numbers.'
  }
  if ([printed, applied, damaged, returned].some((value) => value < 0)) {
    return 'Label quantities cannot be negative.'
  }
  const accounted = applied + damaged + returned
  if (accounted > printed) {
    return 'Applied, damaged and returned labels cannot exceed the confirmed printed quantity.'
  }
  return null
}

export function isWholeQuantity(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

/* --------------------------------------------------------------------------
 * Dashboard aggregation
 * ------------------------------------------------------------------------ */

export interface LabelDashboardFilters {
  from: string
  to: string
  jobType?: LabelType | 'all'
  reconciliationStatus?: 'all' | 'open' | 'reconciled' | 'discrepancy'
  operator?: string
  productId?: string
}

export interface LabelDashboardRow {
  id: string
  name: string
  printed: number
  applied: number
  damaged: number
  returned: number
  unaccounted: number
  applicationRate: number | null
}

export interface LabelTrendRow {
  date: string
  printed: number
  applied: number
}

export interface LabelDashboard {
  jobs: number
  printed: number
  applied: number
  damaged: number
  returned: number
  unaccounted: number
  applicationRate: number | null
  reprintQty: number
  openJobs: number
  reconciledJobs: number
  discrepancyJobs: number
  discrepancyQty: number
  byProduct: LabelDashboardRow[]
  byOperator: LabelDashboardRow[]
  byUsageOperator: LabelDashboardRow[]
  trend: LabelTrendRow[]
}

function inRange(iso: string, fromMs: number, toMs: number): boolean {
  const value = Date.parse(iso)
  return Number.isFinite(value) && value >= fromMs && value <= toMs
}

function addRow(
  map: Map<string, LabelDashboardRow>,
  key: string,
  name: string,
  values: Partial<Omit<LabelDashboardRow, 'id' | 'name' | 'applicationRate'>>,
): void {
  const current = map.get(key) ?? {
    id: key,
    name,
    printed: 0,
    applied: 0,
    damaged: 0,
    returned: 0,
    unaccounted: 0,
    applicationRate: null,
  }
  current.printed += values.printed ?? 0
  current.applied += values.applied ?? 0
  current.damaged += values.damaged ?? 0
  current.returned += values.returned ?? 0
  current.unaccounted += values.unaccounted ?? 0
  current.applicationRate = rate(current.applied, current.printed)
  map.set(key, current)
}

/**
 * Aggregates persisted jobs and (optionally) their events. Nothing is
 * estimated: totals come from the job document and operator attribution from
 * ledger events.
 */
export function buildLabelDashboard({
  jobs,
  events = [],
  filters,
}: {
  jobs: LabelPrintJob[]
  events?: LabelEvent[]
  filters: LabelDashboardFilters
}): LabelDashboard {
  const fromMs = Date.parse(filters.from)
  const toMs = Date.parse(filters.to)
  const validRange = Number.isFinite(fromMs) && Number.isFinite(toMs)

  const filtered = jobs.filter((job) => {
    if (validRange && !inRange(job.createdAt, fromMs, toMs)) return false
    if (filters.jobType && filters.jobType !== 'all' && job.jobType !== filters.jobType) return false
    if (
      filters.reconciliationStatus
      && filters.reconciliationStatus !== 'all'
      && job.reconciliationStatus !== filters.reconciliationStatus
    ) return false
    if (filters.operator && job.printedByName !== filters.operator) return false
    if (filters.productId && !job.lines.some((line) => line.refId === filters.productId)) return false
    return true
  })

  const jobIds = new Set(filtered.map((job) => job.id))
  const byProduct = new Map<string, LabelDashboardRow>()
  const byOperator = new Map<string, LabelDashboardRow>()
  const byUsageOperator = new Map<string, LabelDashboardRow>()
  const trendMap = new Map<string, LabelTrendRow>()

  let printed = 0
  let applied = 0
  let damaged = 0
  let returned = 0
  let reprintQty = 0
  let openJobs = 0
  let reconciledJobs = 0
  let discrepancyJobs = 0

  for (const job of filtered) {
    const totals = labelTotals(job.lines)
    printed += totals.printed
    applied += totals.applied
    damaged += totals.damaged
    returned += totals.returned
    reprintQty += safeQty(job.reprintQty)
    if (job.reconciliationStatus === 'open') openJobs += 1
    if (job.reconciliationStatus === 'reconciled') reconciledJobs += 1
    if (job.reconciliationStatus === 'discrepancy') discrepancyJobs += 1

    addRow(byOperator, job.printedByName, job.printedByName, {
      printed: totals.printed,
      applied: totals.applied,
      damaged: totals.damaged,
      returned: totals.returned,
      unaccounted: totals.unaccounted,
    })

    for (const line of job.lines) {
      const row = reconcileLabelLine(line)
      addRow(byProduct, line.refId, line.name, {
        printed: row.printed,
        applied: row.applied,
        damaged: row.damaged,
        returned: row.returned,
        unaccounted: row.unaccounted,
      })
    }
  }

  const trended = events.filter((event) => jobIds.has(event.jobId))

  for (const event of trended) {
    const date = event.occurredAt.slice(0, 10)
    const current = trendMap.get(date) ?? { date, printed: 0, applied: 0 }
    if (event.kind === 'confirmed' || event.kind === 'reprinted') {
      current.printed += event.lines.reduce((sum, line) => sum + safeQty(line.quantity), 0)
    }
    if (event.kind === 'usage' && event.category === 'applied') {
      current.applied += safeQty(event.quantity)
    }
    trendMap.set(date, current)

    if (event.kind === 'usage' || event.kind === 'adjusted') {
      const actor = event.actorName
      const currentOperator = byUsageOperator.get(actor) ?? {
        id: actor,
        name: actor,
        printed: 0,
        applied: 0,
        damaged: 0,
        returned: 0,
        unaccounted: 0,
        applicationRate: null,
      }
      if (event.category) currentOperator[event.category] += safeQty(event.quantity)
      byUsageOperator.set(actor, currentOperator)
    }
  }

  const unaccounted = Math.max(0, printed - applied - damaged - returned)

  return {
    jobs: filtered.length,
    printed,
    applied,
    damaged,
    returned,
    unaccounted,
    applicationRate: rate(applied, printed),
    reprintQty,
    openJobs,
    reconciledJobs,
    discrepancyJobs,
    discrepancyQty: unaccounted,
    byProduct: Array.from(byProduct.values()).sort((a, b) => b.unaccounted - a.unaccounted),
    byOperator: Array.from(byOperator.values()).sort((a, b) => b.printed - a.printed),
    byUsageOperator: Array.from(byUsageOperator.values()).sort((a, b) => b.applied - a.applied),
    trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
