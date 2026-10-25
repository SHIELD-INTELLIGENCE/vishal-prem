/**
 * Shared CSV export rules.
 *
 * The dialog and its tests use these functions so date validation, row
 * filtering and column ordering cannot drift between screens.
 */

export interface CsvExportColumn<T> {
  key: string
  header: string
  value: (row: T) => string | number | boolean | null | undefined
  /** Columns are selected by default unless this is false. */
  defaultSelected?: boolean
}

export interface CsvDateRange {
  from: string
  to: string
}

/** Hard ceiling. A larger request fails clearly instead of truncating. */
export const MAX_EXPORT_ROWS = 100_000

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

/**
 * Validates a user-entered range. An empty pair means "no date filter" and is
 * valid; a single missing endpoint is not.
 */
export function validateCsvDateRange(from: string, to: string): string | null {
  const start = from.trim()
  const end = to.trim()
  if (!start && !end) return null
  if (!start || !end) return 'Enter both a from date and a to date.'
  if (!isValidIsoDate(start)) return 'Enter a valid from date (YYYY-MM-DD).'
  if (!isValidIsoDate(end)) return 'Enter a valid to date (YYYY-MM-DD).'
  if (start > end) return 'The from date cannot be after the to date.'
  return null
}

/** Returns the date-only key for an ISO timestamp or date. */
export function dateKey(value: string | null | undefined): string {
  if (!value) return ''
  const key = String(value).slice(0, 10)
  return isValidIsoDate(key) ? key : ''
}

/**
 * Inclusive date filtering. Rows without a usable date are excluded when a
 * range is active because their membership cannot be proven.
 */
export function filterRowsByDateRange<T>(
  rows: T[],
  getDate: ((row: T) => string | null | undefined) | undefined,
  range: CsvDateRange,
): T[] {
  const start = range.from.trim()
  const end = range.to.trim()
  if (!start && !end) return rows
  if (!getDate) return rows
  return rows.filter((row) => {
    const key = dateKey(getDate(row))
    if (!key) return false
    return key >= start && key <= end
  })
}

/** Counts rows that would be dropped because they have no usable date. */
export function countRowsMissingDate<T>(
  rows: T[],
  getDate: ((row: T) => string | null | undefined) | undefined,
): number {
  if (!getDate) return 0
  return rows.filter((row) => !dateKey(getDate(row))).length
}

/** Returns selected columns in the user's requested order. */
export function orderedSelectedColumns<T>(
  columns: CsvExportColumn<T>[],
  order: string[],
  selected: ReadonlySet<string>,
): CsvExportColumn<T>[] {
  const byKey = new Map(columns.map((column) => [column.key, column]))
  return order
    .filter((key) => selected.has(key))
    .map((key) => byKey.get(key))
    .filter((column): column is CsvExportColumn<T> => Boolean(column))
}

/** Moves one column up or down, returning a new order array. */
export function moveColumn(order: string[], key: string, direction: -1 | 1): string[] {
  const index = order.indexOf(key)
  if (index < 0) return order
  const target = index + direction
  if (target < 0 || target >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

/** Returns an error message when an export is too large, otherwise null. */
export function validateExportSize(rowCount: number, max = MAX_EXPORT_ROWS): string | null {
  if (rowCount > max) {
    return `This export would contain ${rowCount.toLocaleString('en-IN')} rows, above the ${max.toLocaleString('en-IN')}-row limit. Narrow the date range or filters.`
  }
  return null
}

/** Inclusive bounds from the rows themselves, used for sensible defaults. */
export function dateBounds<T>(
  rows: T[],
  getDate: ((row: T) => string | null | undefined) | undefined,
): { min: string; max: string } | null {
  if (!getDate) return null
  let min = ''
  let max = ''
  for (const row of rows) {
    const key = dateKey(getDate(row))
    if (!key) continue
    if (!min || key < min) min = key
    if (!max || key > max) max = key
  }
  return min && max ? { min, max } : null
}
