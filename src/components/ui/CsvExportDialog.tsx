import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import {
  countRowsMissingDate,
  dateBounds,
  filterRowsByDateRange,
  moveColumn,
  orderedSelectedColumns,
  validateCsvDateRange,
  validateExportSize,
  type CsvExportColumn,
} from '@/lib/csvExport'
import { downloadCsv } from '@/lib/csv'
import { Dialog } from './Dialog'
import { Button, IconButton } from './Button'
import { CheckboxField, TextField } from './Field'

export interface CsvExportDialogProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  filename: string
  rows: T[]
  columns: CsvExportColumn<T>[]
  /** Required for date filtering. Omit for tables without a meaningful date. */
  getDate?: (row: T) => string | null | undefined
  initialFrom?: string
  initialTo?: string
  onExported?: (rowCount: number) => void
}

/**
 * Reusable CSV export dialog. It never changes the caller's rows: callers pass
 * the records that already respect permissions, business scope and the active
 * report filters. This component adds the date range and column choices on top.
 */
export function CsvExportDialog<T>({
  open,
  onOpenChange,
  title = 'Export as CSV',
  description = 'Choose a date range and the columns to include. The file contains only the rows currently available to this screen.',
  filename,
  rows,
  columns,
  getDate,
  initialFrom = '',
  initialTo = '',
  onExported,
}: CsvExportDialogProps<T>) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [order, setOrder] = useState<string[]>(() => columns.map((column) => column.key))
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(columns.filter((column) => column.defaultSelected !== false).map((column) => column.key)),
  )
  const [error, setError] = useState<string | null>(null)
  const wasOpen = useRef(false)

  const bounds = useMemo(() => dateBounds(rows, getDate), [rows, getDate])

  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    setOrder(columns.map((column) => column.key))
    setSelected(new Set(columns.filter((column) => column.defaultSelected !== false).map((column) => column.key)))
    setFrom(initialFrom || bounds?.min || '')
    setTo(initialTo || bounds?.max || '')
    setError(null)
    // Only initialise on the open transition, not when rows change underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filteredRows = useMemo(
    () => filterRowsByDateRange(rows, getDate, { from, to }),
    [rows, getDate, from, to],
  )
  const missingDates = useMemo(() => countRowsMissingDate(rows, getDate), [rows, getDate])
  const selectedColumns = useMemo(
    () => orderedSelectedColumns(columns, order, selected),
    [columns, order, selected],
  )

  function toggleColumn(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setError(null)
  }

  function selectAll() {
    setSelected(new Set(columns.map((column) => column.key)))
    setError(null)
  }

  function clearAll() {
    setSelected(new Set())
    setError(null)
  }

  function useFullRange() {
    setFrom(bounds?.min ?? '')
    setTo(bounds?.max ?? '')
    setError(null)
  }

  function submit() {
    const rangeError = validateCsvDateRange(from, to)
    if (rangeError) {
      setError(rangeError)
      return
    }
    if (selectedColumns.length === 0) {
      setError('Select at least one column to export.')
      return
    }
    const sizeError = validateExportSize(filteredRows.length)
    if (sizeError) {
      setError(sizeError)
      return
    }
    if (filteredRows.length === 0) {
      setError('No records match this date range. Widen the range and try again.')
      return
    }

    downloadCsv(
      filename,
      filteredRows,
      selectedColumns.map((column) => ({
        header: column.header,
        value: column.value,
      })),
    )
    toast.success(`Exported ${filteredRows.length.toLocaleString('en-IN')} row${filteredRows.length === 1 ? '' : 's'} to CSV.`)
    onExported?.(filteredRows.length)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} leftIcon={<Download className="h-4 w-4" />}>
            Export {filteredRows.length.toLocaleString('en-IN')} row{filteredRows.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {getDate && (
          <section>
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                label="From date"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setError(null)
                }}
              />
              <TextField
                label="To date"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setError(null)
                }}
              />
              <Button variant="outline" size="sm" onClick={useFullRange} disabled={!bounds}>
                Use full range
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              {bounds
                ? `Available data: ${bounds.min} → ${bounds.max}. The range is inclusive.`
                : 'No dated rows are available in this view.'}
              {missingDates > 0 && ` ${missingDates} row${missingDates === 1 ? '' : 's'} without a date are excluded when a range is active.`}
            </p>
          </section>
        )}

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <ListChecks className="h-4 w-4 text-brand-600" /> Columns
            </h3>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAll}>Select all</Button>
              <Button variant="outline" size="sm" onClick={clearAll}>Clear all</Button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-500">
            {selectedColumns.length} of {columns.length} selected. Use the arrows to change column order.
          </p>
          <ul className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-200">
            {order.map((key, index) => {
              const column = columns.find((item) => item.key === key)
              if (!column) return null
              return (
                <li key={key} className="flex items-center gap-2 px-3 py-2">
                  <CheckboxField
                    label={column.header}
                    checked={selected.has(key)}
                    onChange={() => toggleColumn(key)}
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <IconButton
                      label={`Move ${column.header} up`}
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => setOrder((current) => moveColumn(current, key, -1))}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Move ${column.header} down`}
                      size="sm"
                      variant="ghost"
                      disabled={index === order.length - 1}
                      onClick={() => setOrder((current) => moveColumn(current, key, 1))}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {error && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
