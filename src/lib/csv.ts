export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | boolean | null | undefined
}

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Spreadsheet formula injection protection. A legitimate signed number such
  // as `-5` or `+0.25` must survive unchanged, so only prefix values that start
  // with a formula character and are not plain numeric data.
  if (/^[=@\t\r]/.test(text)) {
    text = `'${text}`
  } else if (/^[+-]/.test(text) && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    text = `'${text}`
  }
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((column) => escapeCell(column.header)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCell(column.value(row))).join(','))
    .join('\r\n')
  return `\uFEFF${head}\r\n${body}`
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
