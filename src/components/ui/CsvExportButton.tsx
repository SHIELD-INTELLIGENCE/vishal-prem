import { useState } from 'react'
import { Download } from 'lucide-react'
import type { CsvExportColumn } from '@/lib/csvExport'
import { Button } from './Button'
import { CsvExportDialog } from './CsvExportDialog'

/**
 * Small trigger for screens that render custom tables instead of DataTable.
 * The same dialog, date validation and column controls are used everywhere.
 */
export function CsvExportButton<T>({
  filename,
  rows,
  columns,
  getDate,
  title,
  description,
  label = 'Export CSV',
  initialFrom,
  initialTo,
  disabled,
}: {
  filename: string
  rows: T[]
  columns: CsvExportColumn<T>[]
  getDate?: (row: T) => string | null | undefined
  title?: string
  description?: string
  label?: string
  initialFrom?: string
  initialTo?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<Download className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
        disabled={disabled || rows.length === 0}
      >
        {label}
      </Button>
      <CsvExportDialog
        open={open}
        onOpenChange={setOpen}
        filename={filename}
        rows={rows}
        columns={columns}
        getDate={getDate}
        title={title}
        description={description}
        initialFrom={initialFrom}
        initialTo={initialTo}
      />
    </>
  )
}
