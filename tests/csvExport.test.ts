import { describe, expect, it } from 'vitest'
import {
  MAX_EXPORT_ROWS,
  countRowsMissingDate,
  dateBounds,
  dateKey,
  filterRowsByDateRange,
  isValidIsoDate,
  moveColumn,
  orderedSelectedColumns,
  validateCsvDateRange,
  validateExportSize,
  type CsvExportColumn,
} from '@/lib/csvExport'

interface Row {
  id: string
  at: string | null
  name: string
}

const rows: Row[] = [
  { id: 'a', at: '2026-10-01T10:00:00.000Z', name: 'A' },
  { id: 'b', at: '2026-10-15T10:00:00.000Z', name: 'B' },
  { id: 'c', at: '2026-10-31T23:59:59.000Z', name: 'C' },
  { id: 'd', at: null, name: 'D' },
]

const columns: CsvExportColumn<Row>[] = [
  { key: 'name', header: 'Name', value: (row) => row.name },
  { key: 'date', header: 'Date', value: (row) => row.at },
  { key: 'id', header: 'ID', value: (row) => row.id },
]

describe('validateCsvDateRange', () => {
  it('accepts an empty range and inclusive endpoints', () => {
    expect(validateCsvDateRange('', '')).toBeNull()
    expect(validateCsvDateRange('2026-10-01', '2026-10-31')).toBeNull()
    expect(validateCsvDateRange('2026-10-01', '2026-10-01')).toBeNull()
  })

  it('rejects partial, malformed and reversed ranges', () => {
    expect(validateCsvDateRange('2026-10-01', '')).toMatch(/both/i)
    expect(validateCsvDateRange('2026-02-30', '2026-03-01')).toMatch(/valid/i)
    expect(validateCsvDateRange('2026-11-01', '2026-10-01')).toMatch(/cannot be after/i)
  })

  it('validates real calendar dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-2-01')).toBe(false)
  })
})

describe('date filtering', () => {
  it('uses inclusive date-only comparison', () => {
    expect(
      filterRowsByDateRange(rows, (row) => row.at, { from: '2026-10-01', to: '2026-10-15' }).map(
        (row) => row.id,
      ),
    ).toEqual(['a', 'b'])
  })

  it('excludes rows without a usable date when a range is active', () => {
    const filtered = filterRowsByDateRange(rows, (row) => row.at, {
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(filtered.map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(countRowsMissingDate(rows, (row) => row.at)).toBe(1)
  })

  it('keeps all rows when no range is selected', () => {
    expect(filterRowsByDateRange(rows, (row) => row.at, { from: '', to: '' })).toHaveLength(4)
  })

  it('normalises timestamps and reports bounds', () => {
    expect(dateKey('2026-10-01T23:00:00.000Z')).toBe('2026-10-01')
    expect(dateKey('not-a-date')).toBe('')
    expect(dateBounds(rows, (row) => row.at)).toEqual({ min: '2026-10-01', max: '2026-10-31' })
  })
})

describe('column selection and order', () => {
  it('returns only selected columns in the requested order', () => {
    const order = ['date', 'name', 'id']
    const selected = new Set(['date', 'id'])
    expect(orderedSelectedColumns(columns, order, selected).map((column) => column.key)).toEqual([
      'date',
      'id',
    ])
  })

  it('moves columns without dropping any', () => {
    expect(moveColumn(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveColumn(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(moveColumn(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })

  it('ignores unknown selected keys', () => {
    expect(orderedSelectedColumns(columns, ['name'], new Set(['name', 'missing']))).toHaveLength(1)
  })
})

describe('export size', () => {
  it('allows the documented ceiling and rejects larger exports clearly', () => {
    expect(validateExportSize(MAX_EXPORT_ROWS)).toBeNull()
    expect(validateExportSize(MAX_EXPORT_ROWS + 1)).toMatch(/above/i)
  })
})
