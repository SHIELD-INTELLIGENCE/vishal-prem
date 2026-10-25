import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'
import { formatINR, formatQuantity, parseRupeeInput } from '@/lib/format'

describe('toCsv', () => {
  it('adds a UTF-8 BOM and escapes commas, quotes and newlines', () => {
    const csv = toCsv(
      [{ name: 'Kaju, Barfi', note: 'He said "rich"', lines: 'a\nb' }],
      [
        { header: 'Item', value: (row) => row.name },
        { header: 'Note', value: (row) => row.note },
        { header: 'Lines', value: (row) => row.lines },
      ],
    )
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Kaju, Barfi"')
    expect(csv).toContain('"He said ""rich"""')
    expect(csv).toContain('"a\nb"')
  })

  it('neutralises spreadsheet formula injection without corrupting signed numbers', () => {
    const csv = toCsv(
      [
        { value: '=IMPORTXML("https://example.com")' },
        { value: '+91 98765 43210' },
        { value: '@cmd' },
        { value: '-5' },
        { value: '+0.25' },
      ],
      [{ header: 'Value', value: (row) => row.value }],
    )
    expect(csv).toContain("'=IMPORTXML")
    expect(csv).toContain("'+91 98765 43210")
    expect(csv).toContain("'@cmd")
    expect(csv).toContain('\r\n-5')
    expect(csv).toContain('\r\n+0.25')
  })

  it('renders booleans and blank values predictably', () => {
    const csv = toCsv([{ active: true, note: null }], [
      { header: 'Active', value: (row) => row.active },
      { header: 'Note', value: (row) => row.note },
    ])
    expect(csv).toContain('true,')
  })
})

describe('money and quantity formatting', () => {
  it('formats paise as Indian rupees', () => {
    expect(formatINR(123456)).toContain('1,234.56')
    expect(formatINR(0)).toContain('0.00')
    expect(formatINR(Number.NaN)).toContain('0.00')
  })

  it('parses rupee input safely', () => {
    expect(parseRupeeInput('1,250.50')).toBe(125050)
    expect(parseRupeeInput('₹650')).toBe(65000)
    expect(parseRupeeInput('')).toBeNull()
    expect(parseRupeeInput('-5')).toBeNull()
    expect(parseRupeeInput('12.345')).toBeNull()
  })

  it('formats fractional quantities without inventing precision', () => {
    expect(formatQuantity(1.5, 'kg')).toBe('1.5 kg')
    expect(formatQuantity(12, 'piece')).toBe('12 piece')
    expect(formatQuantity(Number.NaN)).toBe('0')
  })
})
